# Cold cache latency 검증 보고서

> **상태: 과거 기준선 보고서이며 현재 동작 문서가 아니다.** 기준 branch는 `develop`, 기준 commit은
> `9059f99fa3047307aaf4409b0555807c7e1589fc`, 측정 실행일은 2026-08-19 Asia/Seoul
> (2026-08-18 UTC)이다. 현재 구현과 실제 API 측정은
> [Assessment deadline 안정화](./12-assessment-deadline-stabilization.md)를 기준으로 한다.

이 기준선에서는 실제 공공 API를 호출하지 않고 외부 응답을 controllable Promise와 fake client로
대체했다. 아래의 Festival 부모 signal/deadline 단절, 호출 종료 뒤 cache population, Festival
`cacheLayer` 구분 불가, `source.summary` 부재 및 P0/P1 제안은 모두 위 기준 commit의 상태를 설명한다.
현재 구현은 Festival cancellation을 공유 waiter 기준으로 전파하고, 취소된 incomplete 결과를 cache에
저장하지 않으며, `recordCache()`/`getTelemetryDetails()`를 통해 `dataset|dateIndex`를 기록한다. 따라서
아래 수치와 결론은 회귀 전후 비교용이고 현재 동작이나 운영 p50/p95/p99를 나타내지 않는다.

## 1. 결론

| 가설                                                             | 판정                            | 근거와 한계                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold cache 때문에 첫 요청이 느리다                               | **PARTIALLY CONFIRMED**         | 모든 cache miss에서 factory가 실행되고, stub benchmark에서 cold 95.826 ms, warm 0.457 ms였다. 실제 Kakao 첫 요청의 원인이 cache였는지는 운영 요청 로그가 없어 확정하지 않았다.                                    |
| Festival full scan이 주요 cold latency 후보다                    | **PARTIALLY CONFIRMED**         | cold miss가 전국 dataset 전체 페이지를 조회하며, 첫 페이지 뒤 나머지를 4개씩 처리한다. 설정 지연 benchmark에서도 4개 source 중 Festival이 65.898 ms로 가장 느렸다. 실제 Festival API 지연 분포는 측정하지 않았다. |
| 전체 2.7초 deadline이 Widget 실패에 영향을 준다                  | **CONFIRMED**                   | 전체 deadline은 service 전체를 `Promise.race`로 종료한다. deadline 오류 시 Tool은 Widget 생성 전 generic text error를 반환한다. 25 ms 축소 deadline 재현에서 assessment와 Widget 생성 모두 도달하지 못했다.       |
| 특정 Source 실패만으로 Partial Result가 가능하다                 | **CONFIRMED**                   | 한 source가 전체 deadline 전에 `FAILED`로 정리되면 `Promise.allSettled()` 뒤 나머지 성공 결과로 assessment와 Widget을 만들었다.                                                                                   |
| 전체 deadline이 먼저 발생하면 Partial Result조차 반환되지 못한다 | **CONFIRMED**                   | 한 source Promise가 settle되지 않은 상태에서 전체 deadline이 발생하면 바깥 `Promise.race`가 먼저 reject한다. `allSettled()` 뒤의 partial-result 조합에 도달하지 못했다.                                           |
| Tool 종료 후 Festival 작업이 계속되고 Cache를 채울 수 있다       | **CONFIRMED**                   | Festival full scan context가 부모 `signal`을 버리고 자체 10초 deadline을 만든다. caller reject 후 controllable Festival Promise를 완료하자 dataset/date index cache가 채워졌다.                                   |
| 두 번째 요청이 Cache Hit로 빨라질 수 있다                        | **CONFIRMED**                   | deadline 뒤 cache completion 재현에서 첫 호출 27 ms deadline 실패 후 두 번째 호출은 0.121 ms, Festival factory 호출 수는 계속 1이었다. 이 효과는 같은 process/replica가 살아 있을 때만 가능하다.                  |
| Payload 크기가 주요 병목이다                                     | **REJECTED** (서버 직렬화 기준) | 대표 fixture의 전체 Tool result는 8,105 bytes, structuredContent 직렬화는 호출당 약 0.0085 ms였다. 외부 API 지연과 비교해 서버 병목으로 보이지 않았다. Kakao 내부 payload 제한 영향은 **NOT VERIFIED**다.         |

핵심 결론은 관찰 가설의 비동기 경로가 실제로 가능하다는 것이다. 다만 “Preview의 해당 요청이
반드시 Festival 때문에 실패했다”는 결론은 requestId가 연결된 운영 로그 없이는 내릴 수 없다.

## 2. 실제 호출 흐름

### Cold

```text
assess_accessible_visit Tool
→ requestId/telemetry 생성
→ VisitAssessmentService.runWithDeadline(2,700 ms)
→ DestinationResolver
  → destination cache MISS
  → /searchKeyword2 (timeout ≤ min(1,500 ms, 남은 overall deadline))
  → destination cache 저장
→ Promise.allSettled(
    Accessibility → cache MISS → /detailWithTour2,
    Weather       → cache MISS → /getVilageFcst page(s),
    Charger       → cache MISS → 지역 dataset API,
    Festival      → date index MISS
                    → nationwide dataset MISS
                    → 부모 signal/deadline 제거
                    → 자체 10초 scan context
                    → first page
                    → remaining pages, concurrency 4
                    → dataset cache 저장
                    → visitDate index 생성/저장
                    → 전체 dataset에서 날짜 필터
                    → 날짜 index에서 거리/radius 필터
  )
→ allSettled 완료 시 partial/full assessment 조합
→ SUMMARY 단일 장소면 Widget envelope 생성
```

Festival이 2.7초 안에 settle되지 않으면 다음 분기가 된다.

```text
2,700 ms overall deadline
→ outer Promise.race reject
→ Tool catch
→ isError + 일반 text 반환 (structuredContent/Widget 없음)

동시에 Festival full scan은 부모 signal이 없으므로 계속 가능
→ 성공 시 CachedLoader.then()
→ nationwide dataset cache 저장
→ visitDate index cache 저장
```

### Warm

```text
assess_accessible_visit Tool
→ Destination cache HIT
→ Promise.allSettled(
    Accessibility cache HIT,
    Weather cache HIT,
    Charger region cache HIT,
    Festival visitDate index cache HIT
  )
→ 외부 factory 호출 없음
→ assessment
→ Widget envelope
```

Festival warm path는 date index가 hit하면 dataset loader까지 내려가지 않는다. 다른 `visitDate`를
요청하면 date index는 miss지만 nationwide dataset은 hit하고 새 날짜 index만 만든다.

## 3. 측정 결과

### 측정 조건

- Node process 하나에서 같은 `경복궁`, visitDate fixture `2026-08-19`, `POWER_WHEELCHAIR` 요청을 연속
  실행했다.
- 실제 `VisitAssessmentService`, `DestinationResolver`, source service, `CachedLoader`,
  `FestivalAdapter`, Widget builder를 사용했다.
- 외부 repository/client만 고정 지연 stub으로 대체했다.
- 설정 지연은 destination 18 ms, accessibility 24 ms, weather 32 ms, charger 27 ms,
  Festival dataset 65 ms다.
- 수치는 구조 재현용 한 번의 로컬 측정이며 production latency 예측값이 아니다.

### Cold / Warm

| Source        | Cold cache               |  Cold latency | Cold status            | Warm cache | Warm latency | Warm status            |
| ------------- | ------------------------ | ------------: | ---------------------- | ---------- | -----------: | ---------------------- |
| destination   | MISS                     |     19.222 ms | RESOLVED               | HIT        |     0.018 ms | RESOLVED               |
| accessibility | MISS                     |     25.027 ms | SUCCESS                | HIT        |     0.347 ms | SUCCESS                |
| weather       | MISS                     |     45.153 ms | AVAILABLE              | HIT        |     0.323 ms | AVAILABLE              |
| charger       | MISS                     |     28.738 ms | SUCCESS                | HIT        |     0.135 ms | SUCCESS                |
| festival      | date MISS + dataset MISS |     65.898 ms | SUCCESS                | date HIT   |     0.141 ms | SUCCESS                |
| **total**     |                          | **95.826 ms** | deadlineExceeded=false |            | **0.457 ms** | deadlineExceeded=false |

Cold에서 각 source는 destination 확정 뒤 병렬 시작한다. 따라서 total은 source latency의 합이 아니라
destination latency와 가장 느린 병렬 source, 조합 overhead의 영향을 받는다.

### Deadline 뒤 cache warming

| 항목                          |                           첫 요청 | Festival 완료 뒤 같은 요청 |
| ----------------------------- | --------------------------------: | -------------------------: |
| 결과                          |                    deadline error |                    SUCCESS |
| latency                       |                             27 ms |                   0.121 ms |
| Festival factory 누적 호출 수 |                                 1 |                          1 |
| cache                         | dataset/date index가 아직 진행 중 |             date index HIT |

첫 caller의 signal은 deadline에 aborted 상태가 됐지만, factory가 그 signal을 따르지 않으면
`CachedLoader`는 caller의 반환 여부와 무관하게 성공 `.then()`에서 값을 저장한다. 실제 Festival
client가 full scan context에서 signal을 제거하므로 같은 상태가 가능하다.

### Festival full scan

로컬 fake response의 `totalCount=5,500`, `pageSize=1,000`에서 다음을 확인했다.

| 항목                                         |        결과 |
| -------------------------------------------- | ----------: |
| HTTP 요청 수                                 |           6 |
| 최대 동시 page 요청                          |           4 |
| 부모 AbortSignal 상속                        |       false |
| 부모 deadline 상속                           |       false |
| 부모 100 ms deadline 대비 scan deadline 연장 | 약 9,900 ms |

일반식은 `max(1, ceil(totalCount / fullScanPageSize))` HTTP 요청이다. 첫 페이지는 단독 요청하고,
나머지는 최대 4개씩 묶어 각 batch를 순차 처리한다. 기본 page size는 1,000이고
`FESTIVAL_API_FULL_SCAN_PAGE_SIZE`로 바뀔 수 있다.

`radiusKm`는 API query가 아니다. 전국 dataset을 모두 받고 방문일 index를 만든 뒤 좌표가 있는
행에 대해 메모리에서 거리 계산과 radius 필터를 적용한다.

### Partial Result 경계

| 시나리오                                 |     total | assessment | Widget     | source status                                                               |
| ---------------------------------------- | --------: | ---------- | ---------- | --------------------------------------------------------------------------- |
| Weather가 20 ms 뒤 실패, overall 150 ms  | 21.419 ms | 반환       | 생성 성공  | Accessibility SUCCESS / Weather FAILED / Charger SUCCESS / Festival SUCCESS |
| Weather가 settle되지 않음, overall 25 ms | 25.347 ms | 반환 안 됨 | 도달 안 함 | `allSettled()` 뒤 조합에 도달 안 함                                         |

`Promise.allSettled()` 사용 자체가 partial result 반환을 보장하지 않는다. 모든 입력 Promise가
settle해야 다음 줄로 진행하며, 그 전체 블록을 감싼 hard deadline이 먼저 reject할 수 있다.

### Timeout과 retry

일반 source는 HTTP attempt마다 다음 timeout을 사용한다.

```text
attempt timeout = min(externalApiTimeoutMs, context.deadlineAtMs - now)
```

retryable 오류이고 retry가 남았으며 `remaining > retryDelay + 50 ms`일 때만 한 번 재시도한다.
기본 retry delay는 첫 retry 기준 40~79 ms jitter다. 축소 설정 검증에서는 request timeout 70 ms,
부모 deadline 130 ms로 두 번 시도했고 두 번째 attempt가 남은 deadline으로 잘려 총 130.785 ms에
종료됐다. timer scheduling 오차 때문에 벽시계 값은 설정값보다 조금 클 수 있다.

Production 설정에서 destination/accessibility/weather/charger는 단순한 `1,500 × 2 = 3,000 ms`를
모두 사용할 수 없다. 부모 signal과 absolute 2,700 ms deadline을 전달하므로 두 번째 attempt는
Tool 시작 후 남은 시간으로 잘리고, source 병렬 처리는 destination 조회가 사용한 시간만큼 더 적은
예산으로 시작한다.

Festival full scan은 예외다. 각 page의 request timeout/retry는 자체 10초 scan deadline만 보고,
부모 2.7초 signal을 보지 않는다. 한 page는 retry delay를 포함해 약 3.04~3.08초까지 사용할 수
있고, 여러 page wave는 자체 10초 범위에서 계속될 수 있다.

### Single-flight

같은 key의 동시 요청 2개를 실행했을 때 factory 호출은 1회였고 두 번째 요청은
`singleflight.join`을 기록했다. 완료 뒤 세 번째 요청은 cache hit였으며 factory 누적 호출은 계속
1회였다.

### Payload

| 항목                                             |         크기/시간 |
| ------------------------------------------------ | ----------------: |
| `structuredContent` JSON                         |       4,387 bytes |
| Widget envelope JSON                             |       3,167 bytes |
| `content[0].text`                                |       3,167 bytes |
| 전체 Tool result JSON                            |       8,105 bytes |
| structuredContent `JSON.stringify` 10,000회 평균 | 약 0.0085 ms/call |

fixture 값에 따른 대표치다. 현재 반환 개수 제한 안에서는 서버 JSON 직렬화가 초 단위 외부 API
지연의 주원인이라고 볼 근거가 없다. Kakao의 내부 크기 제한이나 렌더링 비용은 이 측정으로 판단할
수 없다.

## 4. 발견된 구조적 문제

### 4.1 Festival deadline propagation 단절

`FestivalApiClient.createFullScanContext()`는 `requestId`, `tool`, `telemetry`, `logWriter`만 복사하고
`signal`을 복사하지 않는다. `deadlineAtMs`도 부모와 `min`을 취하지 않고 현재 시각 + 10초로
교체한다. 나머지 client는 같은 `OperationContext`를 HTTP client까지 전달한다.

이 때문에 부모 Tool 종료가 Festival fetch를 취소하지 않으며, cache warming은 가능한 대신 종료된
요청이 최대 scan deadline 동안 HTTP·CPU·메모리를 계속 사용할 수 있다.

### 4.2 Partial Result 생성 시점

source failure를 `FAILED` domain result로 바꾸는 코드는 `Promise.allSettled()` 다음에 있다. 전체
deadline은 그보다 바깥의 `Promise.race`다. 따라서 늦은 source를 overall deadline보다 먼저
settle시키는 source soft deadline이 없으면 partial result용 시간 여유가 보장되지 않는다.

### 4.3 Widget 실패 경로

Tool은 assessment가 성공적으로 반환된 뒤에만 Widget을 만든다. generic deadline/error catch는
`isError: true`와 text content만 반환한다. 반대로 source 하나가 `FAILED`여도 assessment가 hard
deadline 전에 완성되면 Widget은 생성된다. 따라서 “일부 source가 빠진 Widget”과 “Widget 자체가
없는 응답”은 서로 다른 경로다.

### 4.4 Cache warming의 범위

Cache는 process-local이다. deadline 뒤 warming이 성공해도 같은 replica/process로 다음 요청이
라우팅되고 TTL/entry가 남아 있어야 효과가 있다. 재배포, process 종료, 다른 replica에서는 재사용할
수 없다. 이 동작을 안정적인 background refresh로 간주하면 안 된다.

### 4.5 Observability

기준선 로그로 확인 가능했던 항목은 다음과 같다.

| 항목                                   | 기준선 이벤트/필드                                    | 판정 |
| -------------------------------------- | ----------------------------------------------------- | ---- |
| request 연결                           | 모든 이벤트의 `requestId`, `tool`                     | 충분 |
| cache hit/miss                         | `cache.hit`, `cache.miss` + `source`                  | 충분 |
| single-flight join                     | `singleflight.join` + `source`                        | 충분 |
| 외부 API latency/outcome               | `downstream.call` + `source`, `durationMs`, `outcome` | 충분 |
| retry                                  | `downstream.retry` + `source`, `delayMs`              | 충분 |
| source status                          | `tool.summary.sourceStatuses`                         | 충분 |
| 전체 latency                           | `tool.summary.durationMs` / `tool.error.durationMs`   | 충분 |
| overall deadline                       | `deadline.exceeded`                                   | 충분 |
| cache hit source의 end-to-end latency  | 직접 필드 없음                                        | 부족 |
| Festival dataset/date-index cache 구분 | 둘 다 `source=festival`                               | 부족 |

당시 원인 검증에는 raw cache/downstream/deadline 이벤트와 deterministic wrapper 측정을 사용했고
production instrumentation은 추가하지 않았다. 이후 deadline 안정화 구현은 `source.summary`와
Festival `cacheLayer=dataset|dateIndex`를 추가했으며 현재 필드는 후속 문서의 Observability 절을
따른다.

## 5. 기준선 당시 개선 우선순위

아래 P0와 observability P1은 현재 deadline 안정화 구현에서 반영됐다. 아직 남은 후속 판단은 현재
동작 문서의 P1 항목을 따른다.

### P0

1. **Source soft deadline을 hard deadline보다 앞에 둔다.**
   `assessResolvedDestination()`에서 네 source 각각을 부모 context를 base로 한 짧은
   `runWithDeadline()`으로 감싸면 현재 `Promise.allSettled()` 계약을 유지할 수 있다. 예를 들어
   1,800~2,200 ms 범위에서 늦은 source를 reject/`FAILED`로 바꾸고, 남은 500~900 ms를 결과 조합과
   Widget 생성에 남긴다. 실제 값은 운영 latency 로그로 정해야 한다.
2. **Festival parent cancellation/deadline을 복원한다.**
   full scan context는 부모 `signal`을 전달하고 deadline은
   `min(parentDeadlineAtMs, now + fullScanTimeoutMs)`로 정해야 한다. 기본 정책은 요청 종료 시 취소를
   권장한다. process-local warming은 다음 요청이 같은 process에 올 때만 이득이고, 종료 요청마다
   전국 scan이 남는 리소스 위험은 모든 replica에 발생할 수 있기 때문이다.

Background completion을 의도적으로 유지하려면 요청 context를 우연히 끊는 방식이 아니라 별도의
bounded refresh 정책, 동시 실행 제한, 상태 로그, shutdown 정책이 필요하다. 이는 이번 검증 범위를
넘으며 현재 구조에 background worker를 바로 추가하는 것은 권장하지 않는다.

### P1

1. `source.summary`와 Festival `cacheLayer`를 추가해 운영 cold/warm latency를 requestId 단위로
   직접 비교한다.
2. source soft deadline과 overall deadline 경쟁을 controllable Promise/fake timer로 회귀 검증한다.
3. Festival page wave가 취소될 때 새 page를 시작하지 않고 진행 중 fetch도 abort되는지 검증한다.

### P2

1. Kakao Preview에서 동일 requestId의 Tool raw result와 렌더링 결과를 수집해 payload 제한 여부를
   별도 확인한다.
2. 운영 표본에서 cold/warm, Festival page count, timeout, replica/process lifecycle을 함께 보고
   soft deadline 값을 조정한다.

이번 검증에서는 `overallDeadlineMs`, `externalApiTimeoutMs`, retry, cache TTL, Festival 조회 구조를
변경하지 않았다.

## 6. 기준선 당시 수정 후보

당시 `perf/verify-cold-cache-latency` 브랜치에서는 검증 보고서와 문서 index만 수정했다. 개선 적용
후보는 다음과 같았다.

- `src/infrastructure/festival/festival-api.client.ts`: 부모 signal/deadline 상속
- `src/application/services/visit-assessment.service.ts`: source soft deadline과 source completion 계측
- `src/application/ports/operation-context.ts`: telemetry 계약을 확장할 경우
- `src/application/services/request-telemetry.ts`: `source.summary` 또는 cache layer 계측
- `src/infrastructure/cache/cached-loader.ts`: cache layer metadata를 전달하기로 할 경우
- `scripts/logs.mjs`: 새 source/cache-layer 필드 표시

공동 계약이나 Tool schema 변경은 필요하지 않다.

## 7. 테스트 결과

### 로컬 deterministic verification

실제 API 없이 `/tmp/verify-cold-cache-latency.mjs`를 일시 생성해 다음을 검증했다.

- Festival full scan page 수와 concurrency 4
- 부모 Festival signal/deadline 미상속
- overall deadline 뒤 background Promise의 dataset/date-index cache 저장
- 같은 요청의 warm hit와 factory 미호출
- source 하나 실패 시 partial assessment/Widget 생성
- overall deadline이 `allSettled()`보다 먼저 끝날 때 Tool-level 실패
- single-flight join과 이후 cache hit
- retry 두 번째 attempt의 남은 absolute deadline 적용
- structuredContent/Widget/content text byte 크기

검증 스크립트는 저장소 테스트 정책에 따라 커밋하지 않고 실행 후 삭제한다.

| 명령                       | 결과                                      |
| -------------------------- | ----------------------------------------- |
| `npm run typecheck`        | PASS                                      |
| `npm run lint`             | PASS                                      |
| `npm test`                 | 실행 불가: `package.json`에 script가 없음 |
| `npm run build`            | PASS                                      |
| deterministic verification | PASS                                      |

## 코드 근거

- 설정과 TTL: [`performance-config.ts`](../../src/application/services/performance-config.ts)
- overall deadline race/abort: [`deadline.ts`](../../src/application/services/deadline.ts)
- destination 뒤 source 병렬 처리: [`visit-assessment.service.ts`](../../src/application/services/visit-assessment.service.ts)
- cache write와 single-flight: [`cached-loader.ts`](../../src/infrastructure/cache/cached-loader.ts)
- Festival dataset/date index/radius filter: [`festival.adapter.ts`](../../src/infrastructure/festival/festival.adapter.ts)
- Festival full scan context와 page concurrency: [`festival-api.client.ts`](../../src/infrastructure/festival/festival-api.client.ts)
- HTTP timeout/retry/deadline clipping: [`http-client.ts`](../../src/infrastructure/http/http-client.ts)
- Tool error와 Widget 분기: [`assess-accessible-visit.tool.ts`](../../src/mcp/tools/assess-accessible-visit.tool.ts)
- Widget envelope 직렬화: [`widget-result.ts`](../../src/mcp/widgets/widget-result.ts)
- telemetry 이벤트: [`request-telemetry.ts`](../../src/application/services/request-telemetry.ts)
