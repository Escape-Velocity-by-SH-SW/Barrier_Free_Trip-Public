# Bopok MCP performance and scalability analysis

코드 구현 원리, trade-off, ADR, 학습 문제는
[`docs/performance/`](./docs/performance/README.md)를 참고한다.

## 1. Existing request flow

`assess_accessible_visit`의 기존 흐름은 다음과 같다.

```text
MCP Tool handler
→ VisitAssessmentService
→ DestinationResolver
→ TourismAccessibilityRepository.searchDestination
→ KoreaTourApiClient /searchKeyword2
→ Promise.allSettled(
    AccessibilityService → /detailWithTour2,
    WeatherService → /getVilageFcst pages,
    ChargerService → regional charger API,
    FestivalRiskService → focused festival queries → nationwide fallback pages
  )
```

| Source        | Order                      | Normal HTTP calls | Fallback / maximum structure                                                          | Existing timeout | Existing retry |
| ------------- | -------------------------- | ----------------: | ------------------------------------------------------------------------------------- | ---------------: | -------------- |
| Destination   | First, sequential          |                 1 | No fallback                                                                           | 3,000 ms/request | None           |
| Accessibility | After resolution, parallel |                 1 | None                                                                                  | 3,000 ms/request | None           |
| Weather       | After resolution, parallel |         Usually 1 | Sequential pages until `totalCount`                                                   |    3,000 ms/page | None           |
| Charger       | After resolution, parallel |                 1 | None                                                                                  | 3,000 ms/request | None           |
| Festival      | After resolution, parallel | 1–2 focused calls | If empty, `ceil(totalCount / 100)` nationwide pages, four pages concurrently per wave |    3,000 ms/page | None           |

목적지명과 주소가 모두 있으면 festival focused request는 2개다. 따라서 전국 fallback이 발생하고
KMA가 한 페이지라고 가정할 때 단일 destination은
`search 1 + accessibility 1 + weather 1 + charger 1 + focused 2 + festival pages P`, 즉
`6 + P` HTTP calls다. `P = ceil(festivalTotalCount / 100)`이며 데이터 건수에 따라 상한이
늘어난다. 후보 5개를 기존 Tool 5회로 처리하면 `5 × (6 + P)`다.

각 HTTP request에는 실제 fetch abort timeout이 있었으나 Tool 전체 deadline은 없었다. Festival
focused 요청과 nationwide fallback은 순차 단계이고 page wave도 이어지므로 전체 시간은 개별
3초 timeout보다 훨씬 길어질 수 있었다. `Retry-After`는 parse만 하고 실제 retry에는 쓰지 않았다.

Node의 전역 `fetch`와 container 생명주기 동안 유지되는 client instance는 connection pooling을
재사용한다. 매 요청마다 HTTP client를 생성하는 문제는 없었다. 반면 모든 repository 조회는
cache 없이 request마다 반복되었다.

## 2. Bottlenecks

1. Festival focused 검색이 destination/전체 주소의 exact filter라 빈 결과가 잦고, 이후 전국
   dataset을 100건 단위로 반복 다운로드했다.
2. 관광지 검색, 접근성 상세, 같은 지역 charger dataset, 같은 KMA 격자/발표시각, 전국 festival
   dataset이 모든 요청에서 중복 조회되었다.
3. 동시 cache miss를 합치는 single-flight가 없어 인기 관광지 traffic이 downstream stampede로
   이어졌다.
4. destination은 하나만 받아 Host가 후보 수만큼 Tool을 호출했다. 단순 batch `Promise.all`은
   후보 5 × source 4의 burst를 만들 위험이 있었다.
5. 전체 deadline과 signal 전파가 없어 늦은 비핵심 source가 종합 응답을 지연시켰다.
6. retry 정책은 구현되어 있지 않았고 request 단위 요약 telemetry도 없었다.

## 3. Architecture decisions

- Schema: 기존 `destination?: string`과 새 `destinations?: string[]`를 별도 property로 두었다.
  `oneOf`/union은 사용하지 않는다. 정확히 하나만 허용하고 batch `contentId`는 금지한다.
- Candidate limit: 사용자 비교 가능성과 burst 비용을 고려해 5개, candidate concurrency는 2다.
- Normalize/dedup: trim, 연속 공백을 한 칸으로 축약, 대소문자만 무시한다. 내부 공백 제거와
  특수문자 삭제는 실제 장소를 과도하게 합칠 수 있어 하지 않는다.
- Cache: process-local bounded TTL LRU다. cache miss는 원 repository 경로를 실행하며 cache
  오류는 lookup 오류로 전파하지 않는다.
- Single-flight: cache key별 Promise를 공유하고 성공/실패 모두 `finally`에서 제거한다. in-flight
  registry도 최대 entry 수로 제한하고 초과 시 cache 없는 정상 경로로 실행한다.
- Festival: 성공 가능성이 낮은 focused 2-call 경로를 제거했다. 전국 dataset을 1,000건/page로
  가져와 6시간 cache하고 방문일 index를 별도 bounded cache한다. 후보 5개가 같은 날짜면 dataset
  download와 date scan을 공유한다.
- Deadline: Kakao p99 3,000 ms에 300 ms margin을 둔 absolute 2,700 ms다. HTTP attempt timeout은
  최대 1,500 ms이고 남은 deadline보다 길 수 없다. signal은 adapter/client/fetch까지 전달된다.
- Retry: 최대 1회, 40 ms exponential delay+jitter, 최대 200 ms다. 429/502/503/504, timeout,
  network error만 대상으로 하며 deadline이 부족하면 시작하지 않는다.
- Partial result: 기존 source status와 `Promise.allSettled`를 유지했다. 한 source/candidate 실패가
  성공한 source/candidate를 제거하지 않는다.
- Circuit breaker/stale cache: 이번에는 미적용했다. replica별 작은 process cache 환경에서 상태
  튜닝과 stale 표시 계약의 복잡도가 이득보다 크고, 1,500 ms source timeout + 2.7초 deadline +
  partial result가 우선적인 장애 격리를 제공한다.

## 4. Cache matrix

| Data                        | Key                            |            TTL | Max entries | Single-flight |
| --------------------------- | ------------------------------ | -------------: | ----------: | ------------- | ---------- | ------ | --- | --- |
| Destination search          | normalized keyword             |           24 h |         256 | Yes           |
| Accessibility               | `contentId                     | contentTypeId` |        12 h | 512           | Yes        |
| Festival nationwide dataset | `nationwide`                   |            6 h |           1 | Yes           |
| Festival active-date index  | `visitDate`                    |            6 h |          32 | Yes           |
| Charger region dataset      | normalized province/cityCounty |         30 min |          64 | Yes           |
| Weather                     | KMA `nx                        |             ny |    baseDate | baseTime      | visitDate` | 10 min | 256 | Yes |

TTL은 관광지 metadata/접근성의 낮은 변동성, 축제 표준 dataset의 일 단위 성격, charger 기준
dataset의 낮은 실시간성, KMA 발표 주기의 높은 변동성을 기준으로 차등 적용했다. cache는 session
또는 사용자 상태를 저장하지 않는다.

## 5. New batch call counts

단일 cold request의 festival fallback은 focused 2회가 없어지고 page size가 100에서 1,000으로
늘어났다. KMA page 수를 `W`, festival page 수를 `P1000`이라 하면 HTTP calls는
`destination 1 + accessibility 1 + charger 1 + W + P1000`, 즉 `3 + W + P1000`이다.

후보 5개 cold batch에서 모두 같은 region/date이고 weather grid는 서로 다르다고 가정하면
`destination 5 + accessibility 5 + charger 1 + weather 5 + festival P1000`, 즉
`16 + P1000`이다. 같은 weather grid라면 weather도 single-flight/cache로 1회가 되어
`12 + P1000`이다. cache warm이면 해당 source HTTP calls는 0이 된다.

후보 처리는 2개로 제한되며 한 후보 내부의 독립 source 4개만 병렬이다. Festival dataset과
charger region은 batch 및 동시에 들어온 다른 Tool request에서도 key가 같으면 공유된다.

## 6. Observability

종합 Tool summary는 stderr에 다음을 구조화해 남긴다: total duration, requested/canonical candidate
count, deduplicated count, destination resolution latency, API별 누적 latency, downstream attempt
count, cache hit/miss, single-flight join, timeout/retry, partial count, source status counts. API key,
인증 query, 전체 URL, 원본 response는 기록하지 않는다.

## 7. Environment and deployment

Streamable HTTP, stateless transport, Remote MCP, Docker production command는 변경하지 않았다.
Production은 계속 외부 environment injection → `process.env`를 사용한다. Local만 Node 24 built-in
`--env-file=.env`를 사용하는 `npm run start:local`을 제공한다. Docker local test는
`docker run --env-file .env ...`이며 `.env`는 image에 COPY되지 않는다.

## 8. Synthetic benchmark interpretation

`npm run benchmark`는 실제 공공 API에 부하를 주지 않는 fake delay benchmark다. 한 실행의 예:

| Scenario                       | Tool calls | Downstream calls | Observed p99 |
| ------------------------------ | ---------: | ---------------: | -----------: |
| Single cold loader             |          1 |                1 |      3.59 ms |
| Single warm loader             |          1 |                0 |      0.01 ms |
| Concurrent same key ×10        |         10 |                1 |      5.71 ms |
| Legacy model, destinations ×5  |          5 |               25 |     29.33 ms |
| Bounded batch, destinations ×5 |          1 |               17 |      3.59 ms |

이 수치는 architecture overhead와 call amplification 비교용이며 production latency 예측값이
아니다. 실제 cold 평균 100 ms는 외부 API latency와 전국 dataset cold load 때문에 보장할 수
없다. warm cache와 single-flight에서는 process overhead가 작지만, 실서비스 p50/p95/p99는 운영
traffic에서 summary log를 수집해 확인해야 한다. 2.7초 absolute deadline은 p99 목표를 넘기는
downstream work를 중단하고 partial response로 전환하는 안전장치다.
