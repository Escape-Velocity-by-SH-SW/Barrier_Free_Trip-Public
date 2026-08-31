# 01. 전체 변경과 요청 흐름

> 이 문서는 빠짐없는 변경 목록이 필요한 참고편이다. 처음 읽는다면 먼저
> [가장 쉬운 시작](./00-easy-start.md)을 권장한다.

먼저 기억할 내용은 세 가지다.

1. 반복되는 외부 API 조회는 cache로 줄였다.
2. 여러 장소는 한 번에 받되, 두 장소씩만 처리해 순간 부하를 제한했다.
3. 전체 요청이 2.7초를 넘기기 전에 중단하고, 이미 얻은 정보는 버리지 않는다.

## 1. 실제 diff 기준 변경 분류

| 영역                         | 상태           | 핵심 구현                                                |
| ---------------------------- | -------------- | -------------------------------------------------------- |
| 여러 장소 묶음 처리          | 구현           | 기존 Tool에 `destinations` 추가, `assessBatch()` 추가    |
| 입력 정리와 중복 제거        | 구현           | 앞뒤 공백 제거, 연속 공백 축약, 대소문자 무시            |
| 메모리 cache                 | 구현           | 만료 시간과 저장 개수 제한이 있는 `BoundedTtlCache`      |
| 진행 중인 같은 요청 공유     | 구현           | `CachedLoader`의 `Map<Key, Promise>`                     |
| 축제 조회 최적화             | 구현           | 결과가 자주 비던 좁은 검색 제거, 전국·날짜별 데이터 공유 |
| 공통 데이터 재사용           | 구현           | 장소 정보 전달, 지역·격자·날짜별 cache key 재사용        |
| 동시 처리 수 제한            | 구현           | 후보를 두 개씩 처리하는 `mapWithConcurrency`             |
| 전체 종료 시간과 요청 취소   | 구현           | 2.7초 종료 시각과 취소 신호를 실제 `fetch`까지 전달      |
| 부분 결과                    | 구현           | 기존 `Promise.allSettled` 유지, 장소 후보별 결과 보존    |
| 재시도                       | 구현           | 일시적 실패만 최대 1회, 남은 시간 안에서 대기 후 재시도  |
| 차단기·만료 데이터 재사용    | 검토 후 미적용 | 공개 상태 계약과 서버별 상태 관리가 복잡해져 보류        |
| HTTP 연결                    | 기존 유지/개선 | client 재사용 유지, 시간 제한·재시도·측정 기능 개선      |
| MCP 입력·출력 설명           | 구현           | `destination`/`destinations`, 명확한 입력 검사와 사용법  |
| 응답 데이터 크기             | 구현           | 묶음 결과에서 반복되는 장소 정보 제거                    |
| 로컬·운영 환경               | 구현/기존 유지 | 로컬 `--env-file`, 운영 `process.env` 유지               |
| 성능 측정 로그               | 구현           | 종합 요청 요약과 API·cache·재시도 측정값                 |
| 성능 테스트                  | 구현           | 실제 API 없이 가짜 지연 시간을 쓰는 모의 테스트          |
| Redis·DB·메시지 큐·호출 제한 | 미적용         | 대회 인프라를 늘리지 않는 범위와 맞지 않음               |

## 2. 기존 문제

기존 종합 요청은 먼저 장소 하나를 확정하고 네 종류의 데이터를 동시에 조회했다.

```text
assess_accessible_visit
↓
VisitAssessmentService.assess
↓
DestinationResolver.resolve
↓
searchKeyword2 1회
↓
Promise.allSettled
├─ detailWithTour2 1회
├─ KMA page W회
├─ charger 1회
└─ festival focused 1~2회
   ↓ 결과 없음
   nationwide ceil(totalCount / 100)회
```

주소와 목적지명이 모두 있는 일반적인 경우, 기상청 응답이 한 페이지라면 전국 축제 데이터를 다시
조회하는 요청 하나에 `6 + ceil(festivalTotalCount / 100)`번의 HTTP 호출이 필요했다. 후보가 5개면
MCP를 사용하는 프로그램(Host)이 Tool을 5번 호출했고
같은 전국 축제 데이터와 같은 지역 충전소를 반복해서 받았다. HTTP 요청별 3초 timeout은 있었지만
여러 단계 전체를 묶어 제한하는 종료 시간은 없었다.

## 3. 적용한 해결 방법

- `assess_accessible_visit`가 한 장소와 여러 후보를 모두 처리한다.
- `VisitAssessmentService.assessBatch()`가 정규화·중복 제거 후 후보 2개씩 처리한다.
- 외부 API를 연결하는 adapter에 크기와 만료 시간이 제한된 cache를 두고, 진행 중인 같은 요청도 공유한다.
- 축제는 전국 데이터를 한 페이지에 1,000건씩 받고 6시간 재사용한다.
- 모든 공개 Tool에 2.7초의 전체 종료 시간을 두고, 취소 신호를 실제 HTTP 요청까지 전달한다.
- 일부 데이터나 장소 후보가 실패해도 성공한 결과는 남긴다.
- 일시적인 HTTP 실패만 한 번 다시 시도한다.

## 4. 핵심 개념 지도

이 변경은 세 층의 문제를 각각 해결한다.

```text
Host가 Tool을 여러 번 호출하는 문제
→ 여러 장소를 한 번에 받는 입력

같은 데이터를 반복 조회하는 문제
→ 완료 결과는 cache, 진행 중인 요청은 Promise로 공유

한꺼번에 너무 많은 API가 시작되고 일부 응답이 오래 걸리는 문제
→ 동시 처리 제한 + 전체 종료 시간 + 부분 결과
```

Cache는 이미 얻은 결과를 재사용한다. `single-flight`는 같은 데이터 요청이 진행 중일 때 그
Promise를 함께 기다리는 방식이다. 동시 처리 제한은 서로 다른 데이터 요청이 너무 많이 한꺼번에
시작되는 것을 막는다. 전체 종료 시간은 모든 작업이 사용자에게 약속한 시간 안에서만 실행되게 한다.

## 5. 개선 후 실제 데이터 흐름

```text
MCP request
↓
Zod field validation
↓
validateDestinationInput
├─ destination → assess()
└─ destinations → assessBatch()
                    ↓
              normalizeDestinations
                    ↓
              mapWithConcurrency(limit=2)
                    ↓ 후보별
              DestinationResolver.resolve(context)
                    ↓
              KoreaTourAccessibilityAdapter
                    ↓
              CachedLoader
              ├─ cache hit → metadata 반환
              ├─ in-flight hit → Promise 공유
              └─ miss → searchKeyword2 → cache 저장
                    ↓
              확정 Destination 객체 공유
                    ↓ Promise.allSettled
              ├─ Accessibility cache/API
              ├─ Weather grid cache/API
              ├─ Charger region cache/API
              └─ Festival date/dataset cache/API
                    ↓
              실패한 데이터 종류를 FAILED 결과로 변환
                    ↓
              candidate 결과 보존
                    ↓
              batch status + compactBatchResult
                    ↓
              structuredContent
```

실제 normalize/dedup은 Tool handler가 아니라 `assessBatch()` 안에서 한다. Zod는 배열 길이와 각
문자열의 형식을 검증하고, 두 property의 상호 배타성은 `validateDestinationInput()`이 검증한다.

## 6. 왜 이 조합을 선택했는가

새 batch Tool을 만들면 기존 다섯 Tool 정책을 깨고 Host가 어느 종합 Tool을 골라야 할지 더
복잡해진다. 그래서 기존 종합 Tool을 확장했다. Redis나 별도 작업 프로그램을 쓰면 공유성은 좋아지지만 배포
인프라와 장애 지점이 늘어난다. 보폭은 읽기 전용 공공 API 조합 서버이므로 process-local 최적화와
부분 성공이 더 작은 변경으로 큰 효과를 낸다.

## 7. 얻은 점과 감수한 점

- Cache에 값이 없는 첫 요청은 여전히 외부 API 응답을 기다려야 한다.
- 동시에 실행되는 서버 복제본마다 cache가 달라 전체 서버에서 최초 호출이 한 번뿐이라고 보장하지 않는다.
- 후보를 두 개씩 처리하므로 모든 후보를 한꺼번에 실행할 때보다 묶음 요청 시간이 조금 늘 수
  있다.
- 전체 종료 시간이 지나면 일부 데이터는 `FAILED`가 되지만 다른 결과는 유지한다.
- 전국 축제 데이터를 처음 받는 작업이 느리면 해당 요청은 부분 결과가 될 수 있다.

이는 cache가 없어도 기능은 정상 동작하게 유지하면서, 매우 느린 요청과 외부 API의 순간 부하를
줄이기 위한 선택이다.

## 8. 테스트

- Tool schema/validation: `assess-accessible-visit.tool.test.ts`
- Batch/dedup/concurrency/partial: `visit-assessment.service.test.ts`
- Cache/single-flight: `bounded-ttl-cache.test.ts`, tourism adapter test
- Festival 공유: `festival.adapter.test.ts`
- Deadline: `deadline.test.ts`
- Retry: `http-client.test.ts`
- Synthetic 비교: `performance-benchmark.test.ts`

현재 전체 결과는 10 test files, 25 tests 통과다.

## 9. 내가 반드시 이해해야 할 코드

- 파일: `src/mcp/tools/assess-accessible-visit.tool.ts`
  - 함수: `validateDestinationInput`, `registerAssessAccessibleVisitTool`
  - 이유: Host 입력이 단일/복수 application flow로 갈라지는 경계다.
- 파일: `src/application/services/visit-assessment.service.ts`
  - 함수: `assessBatch`, `assessResolvedDestination`
  - 이유: 후보를 두 개씩 실행하고 네 종류의 결과를 합치는 핵심 처리 지점이다.
- 파일: `src/bootstrap/create-container.ts`
  - 함수: `createContainer`
  - 이유: 같은 adapter/cache instance가 process 안에서 재사용되는 이유를 보여준다.

## 10. 면접/설명용 정리

기존에는 후보 수만큼 MCP Tool과 공공 API 호출이 늘었고, 전국 축제 데이터를 반복해서 받는 작업이
가장 큰 병목이었습니다. 기존 종합 Tool이 여러 장소를 한 번에 받도록 확장하고, 후보는 두 개씩만
처리했습니다. 반복 데이터는 만료 시간과 크기 제한이 있는 cache에 저장하고, 같은 조회가 진행
중이면 Promise를 공유합니다. 또한 전체 요청이 2.7초를 넘기기 전에 실제 HTTP 요청을 취소하며,
그때까지 얻은 정보는 부분 결과로 반환합니다. Redis 없이도 한 서버 안의 반복·동시 호출 비용을
줄였고, cache가 사라져도 원래 API를 다시 호출하므로 기능은 정상 동작합니다.

## 11. 성능 효과 지도

| 기능                  | 응답 시간              | 처리량         | API 호출            | 순간 부하 보호  | 매우 느린 요청(p95/p99)    |
| --------------------- | ---------------------- | -------------- | ------------------- | --------------- | -------------------------- |
| 메모리 cache          | 값이 있으면 크게 감소  | 증가           | 감소                | 일부            | 개선                       |
| 진행 중 요청 공유     | 동시 첫 조회 시간 감소 | 증가           | 크게 감소           | 강함            | 개선                       |
| 여러 장소 묶음 처리   | Host 처리 비용 감소    | 증가           | 공유 시 감소        | 중간            | 개선 가능                  |
| 동시 처리 수 제한     | 묶음 시간이 늘 수 있음 | 안정화         | 총량은 같을 수 있음 | 강함            | 폭주 시 개선               |
| 전국 축제 데이터 공유 | 크게 감소              | 증가           | 크게 감소           | 강함            | 개선                       |
| 전체 종료·취소        | 긴 요청 절단           | 자원 회수      | 늦은 작업 감소      | 강함            | 상한 개선                  |
| 제한적 재시도         | 성공률 증가            | 약간 감소 가능 | 증가 가능           | 제한적으로 보호 | 과하면 악화, 현재 1회 제한 |
| 응답 데이터 축약      | 변환·전송 시간 감소    | 소폭 증가      | 변화 없음           | 없음            | 소폭 개선                  |
