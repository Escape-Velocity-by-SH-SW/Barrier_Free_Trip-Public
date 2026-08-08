# 05. 전체 종료 시간, 요청 취소, 부분 결과

먼저 기억할 내용은 세 가지다.

1. HTTP 호출 하나의 제한 시간과 Tool 전체의 종료 시간은 다르다.
2. 전체 종료 시각이 오면 취소 신호를 실제 `fetch`까지 전달해 네트워크 작업을 멈춘다.
3. 일부 데이터가 실패해도 이미 얻은 결과는 유지한다.

## A. 전체 종료 시간과 실제 요청 취소

### 1) 기존 문제

기존 `FetchHttpClient`는 HTTP 호출 하나마다 3초 제한을 두고 시간이 지나면 실제 `fetch`를
취소했다. 하지만 종합 Tool은 장소 검색 뒤 네 가지 데이터를 조회하고 축제 페이지도 여러 번
받으므로, 이것만으로는 전체 시간을 제한할 수 없었다.

```text
장소 검색 최대 3초
↓
festival focused 최대 3초
↓
nationwide page wave 최대 3초 × 여러 wave
```

각 단계가 자기 제한 시간 안에 끝나도 모든 단계의 시간이 더해져 사용자는 훨씬 오래 기다릴 수
있었다. 서버가 재시도 대기 시간을 알려 주는 `Retry-After`를 읽기만 했고, 재시도를 시작할 만큼
전체 시간이 남았는지 판단하는 기준도 없었다.

### 2) 적용한 해결 방법

- `performanceConfig.overallDeadlineMs = 2_700`
- 종합 service의 `withDeadline()`이 전체 종료 시각과 취소 신호를 담은 `OperationContext` 생성
- 개별 네 Tool service도 `runWithDeadline()`으로 같은 2.7초 정책 적용
- Repository port의 optional context를 adapter와 API client까지 전달
- `FetchHttpClient`가 HTTP 호출 한 번의 900ms 제한과 전체 남은 시간 중 더 짧은 값 사용
- 전체 취소 신호를 내부 `AbortController`에 전달해 실제 `fetch` 중단
- 재시도 전에 시간이 충분히 남았는지 검사

### 3) 핵심 개념

Timeout은 작업 하나를 얼마나 기다릴지 정한 시간이다. Deadline은 사용자 요청 전체가 반드시
끝나야 하는 시각이다.

```text
Tool 시작 12:00:00.000
deadlineAt = 12:00:02.700

현재 12:00:02.200
remaining = 500ms
```

이때 HTTP 기본 제한이 900ms여도 실제 호출은 500ms보다 오래 기다릴 수 없다. 재시도 전 대기 시간과
실행에 필요한 최소 시간이 남은 500ms보다 크면 재시도하지 않는다. 모든 함수가 같은 종료 시각을
전달받아야 안쪽 함수마다 2.7초를 새로 시작하는 오류를 피할 수 있다.

`AbortSignal`은 작업을 그만두라는 알림이다. `Promise` 자체를 강제로 없애는 것이 아니라,
`fetch`처럼 이 신호를 지원하는 기능이 알림을 받고 네트워크 요청을 멈춘다. 보폭의 HTTP client는
상위 요청의 취소 신호를 내부 `fetch`까지 전달한다.

### 4) 실제 코드 흐름

```text
VisitAssessmentService.assess/assessBatch
↓
withDeadline
├─ deadlineAtMs = Date.now() + 2700
├─ AbortController 생성
└─ 2700ms timer
↓ OperationContext
DestinationResolver → repository → adapter → API client
↓
FetchHttpClient.requestOnce
├─ remaining = deadlineAtMs - Date.now()
├─ attemptTimeout = min(900, remaining)
├─ caller signal을 fetch controller로 forward
└─ fetch(..., { signal })
```

전체 종료 시간 타이머가 실행되면 시간 초과 횟수를 기록하고 요청을 취소한다. 각 service는 외부
데이터 조회 오류를 기존 `FAILED` 결과로 바꾼다. 작업이 끝나면 타이머와 취소 알림 연결을 정리한다.

### 5) 왜 이 방법을 선택했는가

HTTP 한 번의 제한만 줄이면 900ms보다 느리지만 정상인 응답까지 실패하고, 장소 검색과 네 데이터
조회 시간은 여전히 더해진다. 반대로 전체 종료 시간만 두고 HTTP 취소를 연결하지 않으면 사용자에게
응답한 뒤에도 `fetch`가 연결과 API 호출 한도를 계속 사용한다. 그래서 두 제한을 함께 사용했다.

2.7초는 Kakao p99 3초 목표에서 응답을 합치고 전송할 300ms를 남긴 값이다. 실제 운영 응답 시간을
측정해 조정해야 하지만, 처음부터 목표를 넘는 5초 같은 값은 쓰지 않았다.

### 6) 장점과 한계

- 느리지만 결국 성공할 API를 900ms/2.7초에 중단할 수 있다.
- AbortSignal을 무시하는 CPU 작업이나 third-party Promise는 deadline만으로 강제 종료할 수 없다.
- Single-flight 최초 caller의 signal이 공유 Promise에 영향을 주는 한계가 있다.
- 2.7초는 운영 측정 전의 정책값이며 공공 API가 이 시간 안에 응답한다는 보장은 아니다.
- 개별 Tool보다 종합 Tool의 시간 초과 요약 로그를 주로 확인한다.

### 7) 실패 상황

- Per-request 900ms 초과: `HttpRequestError(kind="TIMEOUT")`
- Overall 2.7초 초과: context signal abort, 진행 fetch 중단
- Retry 대기 중 abort: `waitForRetry()`가 timer/listener 정리 후 reject
- Remaining 0: 다음 HTTP timeout은 최소 1ms이고 signal도 이미/곧 abort
- Adapter가 context를 전달하지 않음: 이번 diff에서 모든 관련 port/client 경로를 함께 변경해 방지

### 8) 테스트

`deadline.test.ts`는 모든 단계가 같은 종료 시각을 쓰고 취소 신호를 받는 작업이 중단되는지 확인한다.
`visit-assessment.service.test.ts`는 느린 축제 조회를 테스트용 30ms 종료 시간으로 중단하고 200ms
안에 다른 데이터를 유지하는지 본다. `http-client.test.ts`는 상위 요청의 취소가 HTTP 시간 초과로
잘못 분류되지 않는지, 이미 취소된 경우 재시도가 시작되지 않는지 검증한다.

### 9) 내가 반드시 이해해야 할 코드

- 파일: `src/application/services/visit-assessment.service.ts`
  - 함수: `withDeadline`
  - 이유: 종합 요청의 전체 종료 시간과 시간 초과 기록이 시작되는 곳이다.
- 파일: `src/application/services/deadline.ts`
  - 함수: `runWithDeadline`
  - 이유: 네 개 개별 Tool도 동일 정책을 쓰게 한다.
- 파일: `src/infrastructure/http/http-client.ts`
  - 함수: `requestOnce`, `getRemainingMs`, `forwardAbortSignal`
  - 이유: 전체 종료 시각이 실제 네트워크 요청 취소로 이어지는 지점이다.

### 10) 면접/설명용 정리

HTTP timeout은 외부 요청 한 번의 제한이고, 전체 종료 시간은 MCP 요청 전체의 제한입니다. 보폭은
시작할 때 2.7초 뒤의 종료 시각을 정하고, 외부 API까지 남은 시간과 취소 신호를 전달합니다. 2.2초가
지났다면 0.5초만 더 쓸 수 있고 시간이 부족하면 재시도하지 않습니다. 종료 시각이 오면 실제
`fetch`를 취소하고 이미 얻은 데이터는 부분 결과로 남깁니다.

## B. 일부 데이터만 실패했을 때

### 1) 기존 문제

종합 service에는 이미 `Promise.allSettled`와 데이터 종류별 실패 처리가 있었다. 그러나 Tool 전체
종료 시간과 여러 장소 후보 개념이 없어, 느린 데이터를 언제 포기하고 한 장소의 검색 실패를 다른
장소와 어떻게 분리할지 정하지 못했다.

### 2) 적용한 해결 방법

기존 데이터 상태와 `Promise.allSettled`를 재사용했다. 공개 결과에 새 `TIMEOUT` 값을 추가하지
않고, 시간 초과된 데이터는 현재 계약의 `FAILED`로 표시한다. 정확한 원인은 요약 로그의 `timeouts`
횟수로 확인한다. 여러 장소 요청은 후보마다 `SUCCESS/NO_DATA/AMBIGUOUS_DESTINATION/FAILED` 결과를
만들고, 평가된 후보에는 네 종류의 결과를 모두 남긴다.

### 3) 핵심 개념

외부 API 네 개를 조합하는 시스템의 전체 성공률은 각 API 성공률보다 낮아진다. 하나라도 실패하면
하나가 실패했다고 전체를 버리면 접근성·날씨처럼 이미 얻은 유용한 정보도 잃는다. 부분 결과는
사용 가능한 정보와 확인하지 못한 항목을 함께 반환해 사용자와 LLM이 조심스럽게 판단하게 한다.

```text
Accessibility SUCCESS
Weather AVAILABLE
Charger SUCCESS
Festival FAILED(timeout)
↓
overallAssessment CHECK_REQUIRED
성공한 세 종류의 데이터 유지
festival caution과 unknown 표시
```

### 4) 실제 코드 흐름

```text
assessResolvedDestination
↓ Promise.allSettled([4 service calls])
├─ fulfilled → service result 사용
└─ rejected → createFailed...Result
↓
createCombinedCautions
createUnknowns
calculateOverallStatus
↓
AccessibleVisitAssessment
```

각 service도 외부 조회 오류를 잡아 `FAILED` 결과를 반환하므로 `allSettled`는 마지막 안전망이다.
묶음 전체 상태는 모든 후보가 정상 평가되고 `CHECK_REQUIRED`도 없을 때만 `SUCCESS`, 일부 후보나
데이터가 부족하면 `PARTIAL_SUCCESS`, 평가에 성공한 후보가 없으면
`FAILED`다.

### 5) 왜 이 방법을 선택했는가

새 `TIMEOUT/UNAVAILABLE/STALE` 상태를 모든 Tool 입력·출력에 추가하는 대신 기존 `FAILED`와 성능
측정 로그를 재사용했다. 계약 변경을 줄이면서 사용자에게는 주의사항과 종합 상태로 불확실성을
알릴 수 있기 때문이다. 네 데이터가 모두 성공해야만 의미가 있는 작업도 아니므로, 하나가 실패할
때 전체를 취소할 필요가 없다.

### 6) 장점과 한계

- `FAILED`만 보면 시간 초과인지 5xx 응답인지 Tool 결과만으로 구분하지 못한다.
- LLM이 부분 결과를 지나치게 낙관적으로 설명하지 않도록 주의사항이 중요하다.
- 일부 정보만으로 `LIKELY_ACCESSIBLE`을 만들지 않도록 overall 정책을 보수적으로 유지해야 한다.
- 각 service가 오류를 내부에서 처리하므로 `Promise.allSettled`에서는 성공으로 끝났지만 내용은
  `FAILED`인 경우가 많다.

### 7) 실패 상황

- 축제 시간 초과: 나머지 데이터 유지, 축제 `FAILED`, 종합 상태 `CHECK_REQUIRED`
- 장소 검색 결과 없음: 해당 후보만 `NO_DATA`, 네 데이터 조회는 시작하지 않음
- 장소를 하나로 확정할 수 없음: 후보 요약 반환, 확정 전에는 네 데이터 조회를 시작하지 않음
- Batch deadline 후 대기 candidate: 해당 candidate `FAILED`
- 모든 candidate 실패: batch top `FAILED`
- 일부 candidate 성공: batch top `PARTIAL_SUCCESS`

### 8) 테스트

`visit-assessment.service.test.ts`의 slow festival 사례는 accessibility `SUCCESS`, weather
`AVAILABLE`, festival `FAILED`, overall `CHECK_REQUIRED`를 검증한다. 같은 service를 batch로 호출해
전체 상태가 `PARTIAL_SUCCESS`이고 성공한 데이터가 보존되는지도 확인한다.

### 9) 내가 반드시 이해해야 할 코드

- 파일: `src/application/services/visit-assessment.service.ts`
  - 함수: `assessResolvedDestination`
  - 이유: 데이터 종류별 성공·실패를 서비스 결과로 바꾼다.
- 같은 파일
  - 함수: `calculateOverallStatus`, `getBatchOverallStatus`
  - 이유: 데이터 일부 실패와 장소 후보 일부 실패를 서로 다른 수준에서 요약한다.
- 파일: `src/application/services/visit-assessment.service.test.ts`
  - 테스트: slow festival deadline
  - 이유: partial failure의 기대 결과가 가장 명확하다.

### 10) 면접/설명용 정리

공공 API 여러 개를 조합할 때 하나의 장애를 전체 장애로 처리하면 쓸 수 있는 정보까지 잃게 됩니다.
보폭은 네 데이터 조회를 `Promise.allSettled`로 분리하고, 실패한 종류만 `FAILED`와 주의사항으로
바꾸며 성공 데이터는 유지합니다. 여러 장소 요청에서도 후보별 실패를 분리하고 전체 상태를
`PARTIAL_SUCCESS`로 표시합니다. 시간 초과 원인은 공개 상태값을 늘리지 않고 성능 측정 로그로
확인하는 방식을 선택했습니다.
