# Assessment deadline 안정화

## 1. 결론

`assess_accessible_visit`의 overall hard deadline은 2,700 ms로 유지했다. Destination 확정 뒤 네
source에는 더 짧은 absolute deadline을 주고, 늦은 source만 `FAILED`로 바꿔 성공한 데이터로
assessment와 SUMMARY Widget을 만든다.

Festival 조회 방식의 결론은 **KEEP**이다. 공공데이터포털 공식 명세에는 날짜·주소 필터 이름이
있지만 날짜가 exact/range/comparison 중 무엇인지, 주소가 exact/partial 중 무엇인지 정의돼 있지
않다. 실제 API 비교도 이 작업 환경에서는 실행하지 않았으므로 주변 축제 누락 가능성이 있는
필터를 production에 적용하지 않았다.

## 2. Deadline 구조

Before:

```text
Destination
  ↓
Promise.allSettled(Accessibility, Weather, Charger, Festival)
  └─ 한 source가 settle되지 않음
                         2,700 ms hard deadline
                                  X
                         assessment/Widget 없음
```

After:

```text
Destination
  ↓ remaining 계산
source deadline = now + min(2,000 ms, parent remaining - 400 ms)
  ↓
Promise.allSettled(
  Accessibility ─ SUCCESS,
  Weather       ─ TIMEOUT → FAILED,
  Charger       ─ SUCCESS,
  Festival      ─ TIMEOUT → FAILED
)
  ↓
partial assessment 조합
  ↓
SUMMARY Widget 생성
  ↓
2,700 ms hard deadline 이전 반환
```

설정은 `performance-config.ts` 한 곳에 둔다.

- `overallDeadlineMs = 2_700`
- `responseReserveMs = 400`
- `maxSourceBudgetMs = 2_000`
- `externalApiTimeoutMs = 1_500`

2,000 ms 상한은 빠른 Destination에서도 source가 hard deadline 전체를 점유하지 않게 약 700 ms를
남긴다. 400 ms reserve는 Destination이 느린 경우에도 조합·summary·반환 경로를 남긴다. Source
budget은 시작 시점의 parent absolute deadline에서 계산하므로 Destination이 쓴 시간만큼 자동으로
줄어든다. 남은 시간이 reserve 이하이면 budget은 0이며 source operation을 호출하지 않는다.

작은 deadline을 주입하는 deterministic 검증에서는 기본 reserve를 전체의 최대 15%로 축소할 수
있다. Production container는 400/2,000 ms를 명시적으로 주입한다.

## 3. Partial Result 정책

각 source를 `runWithDeadline()`으로 감싼 뒤 기존 `Promise.allSettled()`를 유지했다. 공개 Domain
enum에는 `TIMEOUT`을 추가하지 않고 기존 `FAILED`를 쓴다.

| Source 결과                    | 해당 영역         | 다른 영역               | Tool/Widget        |
| ------------------------------ | ----------------- | ----------------------- | ------------------ |
| SUCCESS/NO_DATA 등 정상 settle | 원래 상태 유지    | 유지                    | 정상 조합          |
| API/service exception          | `FAILED`          | 유지                    | Partial Widget     |
| source soft timeout            | `FAILED`          | 유지                    | Partial Widget     |
| source 시작 전 budget 0        | `FAILED`          | 유지                    | 가능한 결과로 조합 |
| parent hard abort              | 진행 중 작업 취소 | hard deadline 실패 경로 | Widget 보장 불가   |

FAILED 영역은 기존 caution과 unknown에 조회 실패 의미가 들어가고 overall assessment는
`CHECK_REQUIRED`, 단일 Tool structuredContent의 최상위 상태는 기존 schema의 `PARTIAL_SUCCESS`가
된다. Widget 디자인과 Tool schema는 바꾸지 않았다.

## 4. Festival parent context와 abort

기존 `createFullScanContext()`는 request metadata만 복사하고 parent `signal`을 제거했으며 deadline을
무조건 현재 시각 + 10초로 바꿨다. 이제 context 전체를 상속하고 다음처럼 제한한다.

```text
festival deadline = min(parent deadline, now + 10,000 ms)
festival signal   = parent signal
```

각 page를 시작하기 전에 abort를 확인한다. 진행 중 fetch는 같은 signal을 받아 취소되고, 이후 page
wave는 시작하지 않는다. Dataset/date-index `CachedLoader` factory가 reject되면 `finally`에서
single-flight registry가 정리되고 실패 값은 cache되지 않는다. 종료된 Tool 뒤에서 cache warming을
계속하는 동작에는 의존하지 않는다.

## 5. Festival Full Scan 판단: KEEP

현재 비용은 다음과 같다.

```text
request count = max(1, ceil(totalCount / fullScanPageSize))
fullScanPageSize = 1,000
remaining-page concurrency = 4
```

Cold miss에서는 전국 row를 받고 6시간 dataset cache를 만든 뒤, 방문일별로
`startDate <= visitDate <= endDate` index를 만들고 좌표 거리/radius를 적용한다. Warm date-index hit는
factory를 다시 호출하지 않는다.

공식 API 명세는 `fstvlStartDate`, `fstvlEndDate`, `opar`, `rdnmadr`, `lnmadr`, `latitude`,
`longitude`, 기관 필드를 request parameter로 공개한다.

- 공식 명세: <https://www.data.go.kr/en/data/15013104/openapi.do>
- 전국 표준 dataset 설명: <https://www.data.go.kr/en/data/15013104/standard.do>

그러나 명세에는 다음이 없다.

- `fstvlStartDate`/`fstvlEndDate`의 exact, 비교, 범위 검색 의미
- 두 날짜 조건을 함께 보낼 때 AND 조건과 `active-on-date` 표현 가능 여부
- 주소의 exact/partial match 의미
- 도로명·지번주소가 비어 있는 record의 보완 규칙
- 위경도 중심의 radius/bounding-box query 의미

`fstvlStartDate=visitDate`가 exact match라면 방문일 전에 시작해 계속 중인 축제를 누락한다. 지역
주소 filter가 정확해도 목적지가 행정구역 경계에 있으면 반경 내 인접 구/시의 축제를 누락한다.
도로명과 지번 중 하나가 비어 있는 row도 있으며 좌표 없는 row는 현재도 거리 계산에서 제외된다.

따라서 후보 판단은 다음과 같다.

| 대안                            | 비용 기대              | 정확도 판단             | 결론      |
| ------------------------------- | ---------------------- | ----------------------- | --------- |
| A. 전국 Full Scan + cache/index | Cold 큼, Warm 작음     | 현재 기준               | KEEP      |
| B. 주소 지역 후보               | row/request 감소 가능  | 경계·주소 누락 위험     | 미적용    |
| C. 날짜 후보                    | 크게 감소 가능         | filter semantics 미검증 | 미적용    |
| D. 지역+날짜                    | 가장 작을 수 있음      | 두 위험이 결합          | 미적용    |
| E. 전국 방식 + source 보호/관측 | 첫 Cold는 timeout 가능 | 정확도 유지             | 이번 구현 |

## 6. 실제 API 비교 명령

자동 검증과 CI는 실제 공공 API를 호출하지 않는다. 실제 key가 주입된 별도 환경에서만 다음 명령을
명시적으로 실행한다.

```bash
npm run verify:festival-filters

npm run verify:festival-filters -- --execute

npm run verify:festival-filters -- \
  --execute \
  --destination 경복궁 \
  --visit-date 2026-08-22 \
  --region 서울특별시 \
  --latitude 37.5796 \
  --longitude 126.977 \
  --radius-km 3
```

기본 실행은 dry-run이다. 별도 옵션 없는 `--execute`는 경복궁, 한국 기준 다음 날, 서울특별시,
반경 3km를 사용한다. 옵션을 지정하면 이 기본값을 덮어쓴다. 실행 시 Full Scan과 날짜,
도로명+지번 지역, 지역+날짜 후보를 같은 local active-date/radius filter에 통과시킨 뒤 다음을
출력한다.

- nearby Festival identity와 개수
- missing/additional identity
- API request count
- received row count
- 후보별 latency

경복궁 하나의 `SAMPLE_MATCH`만으로 대체하지 않는다. 서울 다른 지역, 수도권 행정구역 경계,
지방 관광지를 각각 검증하고 날짜 조건이 장기 축제를 보존하는지 확인해야 한다. 모든 대표 case가
일치하고 공식/실측 semantics가 설명될 때만 후속 P1에서 cache key를 조회 범위에 맞춰 바꾼다.

## 7. Cold/Warm benchmark

```bash
npm run benchmark:assessment

npm run benchmark:assessment -- \
  --execute \
  --cold-runs 20 \
  --warm-runs 5 \
  --cold-delay-ms 500
```

기본 실행은 dry-run이다. `--execute` 시 parent orchestrator가 Cold sample마다 child Node process를
새로 만들어 module state, connection pool, container와 process-local cache를 모두 초기화한다. API
부하를 피하려고 child는 순차 실행하며 기본 250 ms 간격을 둔다. Warm은 선택된 child의 Cold 직후
같은 process/container에서 실행한다.

기본 목적지는 경복궁, 수원화성, 첨성대, 남산서울타워, 해운대해수욕장이고 순환 측정한다. 불국사는
smoke run에서 DestinationResolver가 확정하지 못해 표본에서 제외했다. 방문일을 생략하면 한국 기준
내일을 사용한다. `--destination` 또는 comma-separated `--destinations`로 바꿀 수 있다.

각 표본은 Destination resolution과 source별 cache, latency/status/timeout/budget, HTTP attempt,
retry, first-attempt timeout 및 Festival scan page/request/row를 출력한다. 최종 summary는 source와
total의 count/average/min/max/p50/p95/p99, timeout/partial/deadline rate를 출력한다.

### 2026-08-19 실제 Public API 측정

측정 방문일은 2026-08-20, 이동 조건은 `POWER_WHEELCHAIR`, 반경은 3 km다. 5개 목적지를 4회씩
순환해 fresh-process Cold 20회, 각 목적지의 첫 Cold 직후 Warm 1회씩 총 5회를 실행했다.

| Source                 | count |         avg |      min |      p50 |      p95 |      p99 |      max | source timeout |
| ---------------------- | ----: | ----------: | -------: | -------: | -------: | -------: | -------: | -------------: |
| Destination resolution |    20 |   329.10 ms |   238 ms |   259 ms |   643 ms | 1,272 ms | 1,272 ms |             0% |
| Accessibility          |    20 |   113.50 ms |   102 ms |   113 ms |   121 ms |   125 ms |   125 ms |             0% |
| Weather                |    20 | 1,197.10 ms | 1,035 ms | 1,199 ms | 1,239 ms | 1,323 ms | 1,323 ms |      5% (1/20) |
| Charger                |    20 |    76.70 ms |    38 ms |    61 ms |   167 ms |   310 ms |   310 ms |             0% |
| Festival               |    20 |   344.55 ms |   201 ms |   248 ms |   399 ms | 1,795 ms | 1,795 ms |             0% |

Total Cold:

- average 1,558.79 ms
- min 1,408.50 ms
- p50 1,473.75 ms
- p95 2,072.71 ms
- local sample p99/max 2,309.42 ms
- hard deadline exceeded 0/20 (0%)
- partial 1/20 (5%)

Warm 5회는 모두 Destination과 네 source cache hit였고 external factory/HTTP 재호출은 없었다.
average 1.46 ms, p50 1.41 ms, p95/p99/max 1.59 ms였다.

Weather는 20회 모두 HTTP attempt가 한 번이었고 retry, HTTP-client 자체 timeout,
first-attempt timeout은 0건이었다. 유일한 Weather source timeout은 Weather API 자체가 2초에
근접해서가 아니라 Destination resolution이 1,272 ms로 튄 표본에서 source budget이 1,028 ms로
축소됐기 때문이다. Weather operation은 1,035 ms에 source timer로 종료됐고 Tool은 2,309.42 ms에
Partial Assessment를 반환했다.

Festival은 매 Cold마다 2 pages/2 API requests/1,300 rows였으며 합계 40 requests/26,000 rows였다.
19회는 201~399 ms 범위였고 1회는 첫 HTTP attempt timeout 후 한 번 retry해 1,795 ms에 성공했다.
Festival source timeout이나 partial 원인은 아니었다. 따라서 `KEEP` 판단을 유지한다.

같은 날 기본 경복궁 입력으로 `npm run verify:festival-filters -- --execute`도 실행했다. Full Scan은
2 requests/1,300 rows/337.16 ms였고 후보들은 모두 `SAMPLE_MATCH`였지만 nearby와 후보 row가 모두
0인 단일 표본이므로 Full Scan 대체 근거로 사용하지 않는다.

### Cold first-call Tool acceptance

실제 API 측정은 20개 fresh-process 호출에서 hard deadline 초과 0건, partial 1건, 최대
2,309.42 ms를 확인했다. 별도의 deterministic acceptance는 외부 API 없이 실제 MCP SDK in-memory
transport로 다음 전체 경로를 첫 `tools/call` 한 번에 검증한다.

```text
MCP tools/call
→ assess_accessible_visit handler
→ VisitAssessmentService
→ controllable cold source
→ assessment
→ createWidgetToolResult
→ content[0].text Widget envelope
```

```bash
npm run verify:cold-first-call
```

acceptance 정의는 다음과 같다.

```text
Cold first-call success != 모든 Source SUCCESS
Cold first-call success = Tool 응답 성공 + valid Widget 반환
```

따라서 한 개 이상의 downstream source가 timeout/exception으로 `FAILED`가 되어도 첫 호출에서
`PARTIAL_SUCCESS`, `CHECK_REQUIRED`, 성공 source 데이터, failure caution/unknown 및 valid Widget을
함께 반환해야 한다. 첫 호출이 실패한 뒤 background cache warming으로 두 번째 warm 호출만 성공하는
동작은 acceptance로 인정하지 않는다.

검증은 각 Tool 시나리오마다 새 service와 호출 횟수 0인 source를 만들고 `tools/call`을 정확히 한
번만 보낸다. 모든 source 성공, Festival timeout, Weather timeout, Weather+Festival timeout, 느린
Destination 이후 축소된 source budget, source exception을 확인한다. 모든 경우 `isError !== true`,
Widget envelope JSON parse, `widget`, `copy_text`, provider `widget.status` 부재, structuredContent와
source 상태의 일치, tool hard deadline 미초과를 단언한다. 별도 Festival 검증은 parent abort 시
incomplete dataset 미저장/in-flight 정리와 cold single-flight 이후 cache hit를 확인한다.

### Weather 호출 체인 판단

```text
Destination coordinates
→ Lambert grid 변환(nx, ny)
→ KMA 발표 baseDate/baseTime 선택
→ /getVilageFcst, numOfRows=1000
→ totalCount까지 page 순차 수집
→ visitDate/category filter
→ daily forecast mapping
→ cache
```

이번 20회는 모두 Weather HTTP request 1회로 끝났다. 공통 HTTP client는 attempt당 최대 1,500 ms,
일시 오류에 최대 1회 retry를 적용하고 source/parent absolute deadline을 넘지 않는다. Cache key는
`nx|ny|baseDate|baseTime|visitDate`, TTL은 10분이며 Warm에서 5/5 hit와 HTTP 0회를 확인했다. Grid
변환과 mapping은 로컬 동기 계산이고 source latency가 HTTP 1회와 거의 겹쳐, 현재 약 1.2초의 주된
비용은 KMA downstream 응답 대기로 판단한다.

### Merge 판단

결론은 **READY_TO_MERGE_WITH_P1_WEATHER**다.

- Normal Weather p95 1,239 ms/p99 1,323 ms로 2,000 ms 상한에는 여유가 있다.
- Total p95 2,072.71 ms, local sample p99/max 2,309.42 ms이고 hard deadline 초과는 0건이다.
- 느린 Destination 때문에 budget이 축소된 실제 표본에서도 hard deadline 대신 Partial Assessment가
  반환됐다. Partial Widget 경로는 별도의 결정적 검증에서 확인했다.
- Warm regression은 없다.
- 따라서 2,700/2,000/400 ms를 이번 브랜치에서 조정하지 않는다.
- P1에서는 KMA 약 1.2초 downstream latency와 느린 Destination resolution이 겹칠 때의 Weather
  partial rate를 더 큰 운영 표본으로 관찰한다. 이번 브랜치에서 Weather 구조를 리팩터링하지 않는다.

이 수치는 실제 공공 API를 사용하는 로컬 MCP 서버 Cold/Warm 표본이다. 표본 20개의 p99는 사실상
상위 outlier이며 통계적으로 안정적인 운영 p99가 아니다. Kakao 전체 end-to-end latency나 운영 p99
달성을 증명하지 않는다. Kakao Preview는 UI와 Tool-call 확인용으로만 사용한다.

## 8. Observability

- `source.summary`: source, budgetMs, durationMs, status,
  `SUCCESS|ERROR|TIMEOUT|PARENT_ABORT`, timeout, parentAbort
- `deadline.exceeded`: `scope=tool|source`, source
- `cache.hit|cache.miss|singleflight.join`: Festival이면 `cacheLayer=dataset|dateIndex`
- `festival.scan.summary`: duration, page count, API request count, received row count, status
- `tool.summary`: total duration, partial count, source status counts, cache/downstream counters

`npm run logs -- request <requestId>`와 source별 조회에서 이 이벤트를 확인한다. Production log는
request/row 원문이나 API key를 남기지 않고 scan당 summary 한 줄만 추가한다.

## 9. 검증

실제 API 없는 controllable promise 검증에서 다음을 확인했다.

- 모든 source가 빠르면 모두 성공
- Festival만 지연되면 Festival `FAILED`, 나머지 유지, hard deadline 전 반환
- Weather와 Festival이 지연되면 두 영역만 `FAILED`
- source exception은 해당 영역만 `FAILED`
- Destination이 reserve 직전까지 지연되면 새 source operation을 시작하지 않음
- Festival client가 parent signal과 더 이른 deadline을 그대로 사용함
- cache hit에서 factory 재호출 없음
- 동일 cold key가 single-flight factory 하나를 공유함
- Partial Assessment Widget JSON parse, envelope/copy_text, provider `widget.status` 부재

검증 스크립트는 저장소 정책에 따라 `/tmp`에서 실행하고 제거한다.

## 10. 남은 위험과 P1

- 실제 공공 API local Cold 20회는 운영 traffic/시간대/replica 분포를 대표하지 않는다.
- Destination resolution outlier가 source budget을 줄이면 약 1.2초 Weather가 partial로 전환될 수
  있다.
- Festival은 20회 중 한 번 첫 attempt timeout/retry가 발생해 1,795 ms까지 상승했다.
- process-local cache는 재배포, process 종료, 다른 replica에서 공유되지 않는다.
- 실제 filter semantics와 대표/경계 case identity 비교 전에는 Full Scan을 대체할 수 없다.
- Kakao 전체 end-to-end latency는 로컬 benchmark로 측정할 수 없다.

P1은 운영 `source.summary`로 Destination/Weather 분포와 partial rate를 더 많이 수집하고 KMA 약
1.2초 응답 비용을 별도 분석한다. Festival filter는 실제 key가 있는 분리 환경에서 대표/경계 case를
반복 비교한 뒤에만 Full Scan 대체를 다시 판단한다.
