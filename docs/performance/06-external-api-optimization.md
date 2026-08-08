# 06. Festival·HTTP·MCP 응답 최적화

먼저 기억할 내용은 세 가지다.

1. 장소마다 전국 축제 데이터를 다시 받던 구조를 없애고 6시간 동안 공유한다.
2. 재시도는 일시적인 오류에만 한 번 허용하며, 전체 남은 시간이 부족하면 하지 않는다.
3. 여러 장소의 응답에서 같은 장소 정보가 반복되지 않도록 전송 데이터 크기를 줄였다.

## 1) 기존 문제

가장 큰 병목은 `FestivalAdapter.findNearby()`였다.

```text
destinationName focused query
+ full address focused query
↓ 둘 다 결과 없음
getAllFestivals
↓ first page 100건
remaining pages, concurrency 4
```

기존의 좁은 범위 검색은 관광지명과 전체 도로명 주소로 주변 축제를 찾으려 했다. 하지만 축제명이나
개최장소가 관광지명과 다르면 결과가 비었다. 그러면 결국 전국 데이터를 다시 받기 때문에, 먼저
시도한 두 번의 호출이 추가 비용만 만들었다. 이 흐름이 장소마다 반복됐다.

HTTP client에는 시간 제한과 공용 `fetch` 재사용이 이미 있었지만 재시도는 없었다. 서버가 알려 준
재시도 대기 시간인 `Retry-After`도 읽기만 했다. 여러 장소의 결과에는 같은 장소 객체가 네 데이터
결과마다 반복될 수 있었다.

## 2) 적용한 해결 방법

### Festival

- Focused query 경로 제거
- 전국 dataset 기본 page size를 100→1,000으로 확대
- 정리된 전국 데이터를 `nationwide`라는 key로 6시간 저장하고 진행 중인 같은 조회 공유
- 방문일에 열리는 축제 목록을 날짜별로 최대 32개 저장
- 각 장소는 저장된 당일 축제 목록에서 거리만 계산

### Retry와 HTTP

- 429, 502, 503, 504, 네트워크 오류, 시간 초과만 재시도 후보
- 최대 1회
- 기본 40ms에서 조금씩 늘어나는 대기 시간과 작은 무작위 값을 적용하며 최대 200ms
- `Retry-After`가 200ms보다 길면 너무 일찍 다시 호출하지 않고 재시도 자체를 포기
- 전체 남은 시간이 대기 시간과 최소 실행 시간보다 짧으면 재시도하지 않음
- 기존의 process 공용 `fetch`와 container에서 한 번 만든 HTTP client를 계속 재사용

### Tool 입력·설명·응답 크기

- 단일 `destination`과 batch `destinations`를 분리
- `PARTIAL_SUCCESS`, `INVALID_INPUT`, batch results를 output schema에 추가
- description에 Bopok, 단일/복수 사용법, 최대 5개, 반복 호출 대신 batch 사용 명시
- annotations 5종 유지
- `compactBatchResult()`가 데이터 결과마다 반복되는 장소 정보 제거

## 3) 핵심 개념

### 전국 데이터를 저장하는 이유

장소 좌표별 축제 결과를 저장하면 좌표 조합이 너무 많아진다. 대신 전국 축제 데이터를 한 번
저장하면 어떤 장소든 메모리에서 거리를 계산할 수 있다. 오래 걸리는 네트워크 다운로드는 공유하고,
비교적 빠른 거리 계산은 장소마다 수행하는 방식이다.

날짜별 목록은 모든 축제를 장소마다 다시 날짜로 거르는 작업도 줄인다. 방문일이 같은 후보는 그날
열리는 축제 목록을 함께 사용한다.

### 재시도를 많이 하면 생기는 문제

재시도는 짧은 장애의 성공률을 높이지만 이미 문제가 생긴 API에 호출을 더 보낸다. 장소 5개와 네
종류의 데이터가 여러 번 재시도하면 장애를 더 키울 수 있다. 그래서 재시도할 HTTP 상태를 좁히고
한 번만 허용하며, 전체 시간이 충분히 남았는지 확인한다.

### HTTP 연결 재사용

`createContainer()`는 데이터 종류별 `FetchHttpClient`를 한 번 만든다. Node 24의 공용 `fetch`는
기존 연결을 다시 사용할 수 있으므로 요청마다 client를 새로 만들지 않는다. 이번 작업에서는 새
연결 관리 설정을 넣지 않고 기존 재사용 구조를 유지했다.

### 반복되는 응답 데이터 줄이기

여러 장소를 한 번에 반환하면 작은 중복 항목도 후보 수만큼 커진다. 종합 결과 위쪽에 이미 장소
정보가 있으므로 접근성·날씨·충전소·축제 결과 안의 같은 객체를 Tool이 응답을 만들 때만 제거했다.
내부 데이터 모델은 바꾸지 않아 기존 단일 장소 응답 형식을 지켰다.

## 4) 실제 코드 흐름

```text
FestivalRiskService.assess(destination, date, context)
↓
FestivalAdapter.findNearby
↓
dateIndexLoader.load(visitDate)
├─ hit → active festivals
└─ miss
   ↓ datasetLoader.load("nationwide")
   ├─ hit → mapped dataset
   └─ miss → FestivalApiClient.getAllFestivals
              ↓ page 1, 1000 rows
              ↓ remaining pages max 4 per wave
              ↓ mapper
   ↓ date filter
   ↓ date index 저장
↓
coordinates가 있는 festival만 radius filter
↓ distance sort / event key dedup
```

HTTP retry 흐름:

```text
request()
↓ requestOnce()
↓ error
shouldRetry(error, attempt, retryDelay, context)
├─ 일시적 오류 아님 / 재시도 소진 / 요청 취소 / 남은 시간 부족 → 실패 반환
└─ 재시도 가능 → 횟수 기록 → 취소 가능한 대기 → requestOnce()
```

## 5) 왜 이 방법을 선택했는가

주소의 시도/시군구 검색으로 focused API를 개선하는 선택도 있었지만 해당 표준 API filter의 부분
검색 정확도와 포함 범위를 확신하기 어려웠다. 전국 데이터는 한 페이지에 1,000건씩 받을 수 있고
여러 장소가 공유할 수 있어 전체 데이터 cache를 선택했다. 별도 DB에 주기적으로 저장하려면 최신
데이터 관리와 배포 구성이 더 필요해 이번 범위를 넘는다.

여러 장소 전용 Tool을 새로 만드는 대신 기존 Tool 입력을 확장한 것은 다섯 Tool을 유지하고 Host가
안정적으로 Tool을 선택하게 하기 위해서다. 내부 모델에서 장소 정보를 제거하지 않고 여러 장소의
MCP 응답을 만들 때만 줄여 기존 단일 호출과의 호환성을 지켰다.

## 6) 장점과 한계

- 전국 데이터를 처음 받는 작업은 여전히 여러 페이지의 HTTP 호출이 필요할 수 있다.
- Dataset entry 수는 1로 bounded지만 한 entry의 정확한 byte 크기 상한은 없다.
- Date index는 최대 32개 배열을 보관해 dataset reference 배열 메모리를 추가 사용한다.
- 기존의 좁은 검색이 잘 맞던 장소도 이제 처음에는 전국 데이터를 받는 비용이 든다.
- 한 번의 재시도도 외부 API 호출 수와 응답 시간을 늘릴 수 있다.
- JSON 해석 실패는 HTTP 상태 자체는 성공으로 기록된 뒤 잘못된 응답 오류가 된다.
- Node fetch pool 세부 크기를 코드에서 명시적으로 튜닝하지 않았다.
- Batch `assessment` output은 `z.unknown()`이라 nested schema contract가 강하지 않은 기존 성격을
  유지한다.

## 7) 실패 상황

- 축제 첫 페이지 실패: 전국 데이터 미저장, 공유 Promise 실패, 축제 결과 `FAILED`
- 나머지 페이지 하나 실패: 전체 조회 실패, 불완전한 데이터는 cache하지 않음
- 전국 데이터 만료: 다음 요청 하나가 새로 받고 같은 시점의 요청은 그 작업을 공유
- 429 + Retry-After 10초: 200ms retry budget보다 커서 retry하지 않음
- 503: deadline 여유가 있으면 1회 retry
- 400/401/403: retry하지 않음
- Retry 대기 중 deadline: abort listener가 delay timer를 정리하고 종료
- 장소를 하나로 확정하지 못함: 후보를 최대 5개 요약해 응답 크기 제한

## 8) 테스트

`festival.adapter.test.ts`는 동일 날짜의 5개 관광지가 `getAllFestivals()` 한 번을 공유하는지
확인한다. `http-client.test.ts`는 503 retry 성공, 400 non-retry, aborted deadline non-retry,
긴 Retry-After non-retry를 검증한다. Tool contract test는 단일/batch schema와 validation을
검증한다. Synthetic benchmark는 legacy 25 calls와 shared batch 17 calls 모델을 비교한다.

## 9) 내가 반드시 이해해야 할 코드

- 파일: `src/infrastructure/festival/festival.adapter.ts`
  - 함수: `findNearby`, `getMappedFestivals`
  - 왜 중요한지: 전국 dataset과 date index의 두 단계 reuse를 보여준다.
- 파일: `src/infrastructure/festival/festival-api.client.ts`
  - 함수: `getAllFestivals`
  - 왜 중요한지: 첫 page로 totalCount를 알고 remaining pages를 bounded wave로 받는다.
- 파일: `src/infrastructure/http/http-client.ts`
  - 함수: `shouldRetry`, `getRetryDelayMs`
  - 왜 중요한지: 어떤 실패를 왜 다시 시도하거나 포기하는지 정책이 있다.
- 파일: `src/mcp/tools/assess-accessible-visit.tool.ts`
  - 함수: `compactBatchResult`
  - 왜 중요한지: Domain contract를 건드리지 않는 response 최적화다.

## 10) 면접/설명용 정리

축제명과 주소로 먼저 두 번 검색한 뒤 전국 데이터를 다시 받던 흐름을 제거했습니다. 전국 축제는
한 페이지에 1,000건씩 받아 6시간 공유하고, 방문일 목록을 만든 뒤 장소와의 거리를 계산합니다.
HTTP는 일시적인 실패만 전체 남은 시간 안에서 한 번 재시도하고, `Retry-After`가 너무 길면
재시도하지 않습니다. HTTP client와 Node.js의 공용 `fetch`는 계속 재사용합니다. 여러 장소 응답은
내부 모델을 바꾸지 않고 Tool이 반환하기 직전에 중복 장소 정보만 제거합니다.

## 검토했지만 적용하지 않은 외부 시스템 대안

| 대안                  | 이번에 미적용한 이유                      | 필요해지는 시점                            |
| --------------------- | ----------------------------------------- | ------------------------------------------ |
| Redis 공유 cache      | 인프라·네트워크·운영 복잡도 증가          | 서버 사이 API 호출도 크게 줄여야 할 때     |
| DB snapshot           | DB 금지, ETL/신선도 관리 필요             | dataset이 매우 크고 API scan이 불가능할 때 |
| 메시지 큐·별도 작업   | 요청 즉시 응답하는 현재 구조에는 과함     | 사전 수집·비동기 갱신 작업이 필요할 때     |
| Kubernetes 조정       | 대회 서버 수와 메모리를 통제하지 못함     | 운영팀과 자동 확장·성능 목표를 관리할 때   |
| Global rate limiter   | 사용자별 식별/공유 저장소 없음            | API quota 초과가 실제 지표로 확인될 때     |
| 장애 API 임시 차단    | 기준 조정과 잘못된 차단, 서버별 상태 문제 | 특정 API의 장기 장애가 반복 측정될 때      |
| 만료 데이터 임시 사용 | `STALE` 공개 계약과 백그라운드 갱신 필요  | 최신성보다 결과 제공이 더 중요해질 때      |
