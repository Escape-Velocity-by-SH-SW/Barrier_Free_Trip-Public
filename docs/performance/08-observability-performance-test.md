# 08. 관측성과 성능 테스트

먼저 기억할 내용은 세 가지다.

1. 종합 요청 하나가 얼마나 걸렸고 외부 API를 몇 번 불렀는지 stderr 로그로 남긴다.
2. API key, 전체 URL, 원본 응답 같은 민감 정보는 기록하지 않는다.
3. 모의 성능 테스트는 호출 구조를 비교하는 용도이며 실제 운영 p99를 보장하지 않는다.

## 1) 기존 문제

기존 로그는 시작, 치명적 오류, 일부 데이터 조회 실패 중심이었다. 요청 하나에 걸린 시간, cache의
효과, 재시도 횟수를 한눈에 볼 요약이 없었다. 실제 공공 API에 부하를 주지 않고 5개 개별 호출과
한 번의 묶음 호출을 비교하는 성능 테스트도 없었다.

## 2) 적용한 해결 방법

`InMemoryRequestTelemetry`를 요청마다 만들고 `OperationContext`로 하위 계층에 전달한다.

- cache hit/miss
- single-flight join
- 외부 API 시도 횟수와 데이터 종류별 누적 응답 시간
- retry
- HTTP/overall timeout

`VisitAssessmentService.logSummary()`는 여기에 전체 시간, 입력·정리·중복 제거 후 후보 수, 장소 확정
시간, 부분 결과 수, 데이터 종류별 상태 수를 합쳐 stderr로 남긴다.

`performance-benchmark.test.ts`는 가짜 지연 시간과 cache·동시 처리 제한을 사용한다. Cache가 비어
있을 때와 채워졌을 때, 같은 요청 10개, 기존 방식 5개, 묶음 방식 5개를 비교하고 p50/p95/p99를
출력한다. `npm run benchmark`로 별도 실행한다.

## 3) 핵심 개념

로그는 어떤 일이 있었는지 남기는 기록이고, 지표는 횟수나 시간 같은 숫자를 모은 값이다. 현재
구현은 외부 지표 수집 서버 없이 요청 하나의 숫자를 모아 구조화된 로그로 출력한다. 평균만 보면
드물게 매우 느린 요청을 놓칠 수 있어 p95와 p99도 중요하다.

- 응답 시간(latency): 요청 한 건이 끝나는 시간
- 처리량(throughput): 일정 시간 동안 처리할 수 있는 요청 수
- p99: 요청 100개 중 약 99개가 이 값 이하에서 끝남
- Hit ratio: cache hit / cache lookup
- 외부 호출 수: Tool 한 번이 만드는 공공 API 호출 수

가짜 지연 시간을 쓰는 모의 성능 테스트는 코드 구조의 비용과 호출 수만 비교한다. 실제 공공 API의
네트워크 응답 시간이나 운영 p99를 예측하지는 못한다.

## 4) 실제 코드 흐름

```text
assess/assessBatch 시작
↓ InMemoryRequestTelemetry 생성
OperationContext.telemetry
↓
CachedLoader → recordCache / recordSingleFlightJoin
FetchHttpClient → recordDownstreamCall / recordRetry
withDeadline → recordTimeout
↓
assessment 조립
↓
logSummary
↓ console.error(stderr)
```

stdio 방식에서는 stdout 로그가 MCP 메시지와 섞일 수 있으므로 요약도 `console.error`를 써서
stderr로 보낸다. API key, 인증 값, 전체 URL, 원본 응답은 기록하지 않는다.

## 5) 왜 이 방법을 선택했는가

OpenTelemetry나 Prometheus 같은 도구를 추가하면 장기간의 통계와 화면을 만들기 쉽지만 운영
인프라와 라이브러리가 늘어난다. 먼저 요청별 요약으로 병목과 cache 효과를 확인하게 했다. 나중에
운영 환경이 정해지면 외부 수집 도구를 연결할 수 있도록 측정 코드의 호출 지점은 분리했다.

성능 테스트가 공공 API를 직접 호출하면 호출 한도를 소모하고 실행할 때마다 결과도 크게 달라진다.
따라서 가짜 지연 시간을 사용해 중복 호출 감소, 진행 중 요청 공유, 두 후보씩 처리하는 구조를
검증한다.

## 6) 장점과 한계

- 로그만으로 장기간 percentile을 자동 계산하지 않는다.
- 여러 서버의 로그를 합치려면 운영용 로그 수집 시스템이 필요하다.
- 개별 네 Tool보다 종합 Tool summary가 중심이다.
- 가짜 밀리초 수치는 운영 성능 목표를 달성했다는 증거가 아니다.
- 테스트 실행 순서와 시스템 상태에 따라 모의 응답 시간은 실행마다 달라진다.
- 가짜 repository를 쓰는 단위 테스트에서는 실제 HTTP 측정값이 0인 것이 정상이다.

## 7) 실패 상황

- Telemetry 객체 없음: optional chaining으로 서비스 동작에 영향 없음
- Logging backend 장애: `console.error` 자체를 별도 전송하지 않으므로 application 계산과 분리
- Cache 내부 오류: cache 오류를 기록하고 외부 API를 다시 조회
- 성능 테스트 수치 변동: 정확한 밀리초 대신 호출 수와 상대적인 구조를 검사
- API key 노출 위험: log context에 URL/query/raw response를 넣지 않음

## 8) 테스트와 현재 결과

최종 검증:

```text
npm run typecheck  PASS
npm run lint       PASS
npm test           10 files / 25 tests PASS
npm run build      PASS
npm run benchmark  PASS
```

모의 성능 테스트를 한 번 실행한 예:

| Scenario                   | Tool | Downstream |     p99 |
| -------------------------- | ---: | ---------: | ------: |
| 단일 요청, cache 비어 있음 |    1 |          1 |  3.59ms |
| 단일 요청, cache에 값 있음 |    1 |          0 |  0.01ms |
| concurrent same key ×10    |   10 |          1 |  4.59ms |
| legacy five model          |    5 |         25 | 29.43ms |
| bounded batch five         |    1 |         17 |  3.64ms |

이 결과에서 중요하게 볼 부분은 `10→1`, `Tool 5→1`, `외부 API 25→17`이라는 호출 수다. 실제 p99가
3초 안에 들어오는지는 운영 요약 로그를 모아 검증해야 한다.

## 9) 내가 반드시 이해해야 할 코드

- 파일: `src/application/services/request-telemetry.ts`
  - 클래스: `InMemoryRequestTelemetry`
  - 왜 중요한지: 요청-local counter의 범위와 snapshot을 보여준다.
- 파일: `src/application/services/visit-assessment.service.ts`
  - 함수: `logSummary`
  - 왜 중요한지: 운영에서 한 Tool 호출을 어떻게 관찰하는지 보여준다.
- 파일: `src/application/services/performance-benchmark.test.ts`
  - 함수: `benchmarkConcurrentTen`, `benchmarkLegacyFive`, `benchmarkBatchFive`
  - 왜 중요한지: 측정하는 것과 측정하지 않는 것을 코드로 확인할 수 있다.

## 10) 면접/설명용 정리

요청마다 작은 성능 기록 객체를 만들고 cache 사용, 진행 중 요청 공유, HTTP 호출, 재시도, 시간
초과를 함께 기록한 뒤 stderr에 요약합니다. 민감한 URL과 API key는 기록하지 않습니다. 공공 API
대신 가짜 지연 시간을 써서 같은 key의 요청 10개가 외부 호출 한 번을 공유하는지, 묶음 입력이 Tool
5회를 1회로 줄이는지 검증했습니다. 이 테스트의 p99는 운영 수치가 아니므로 실제 운영 로그를 모아
최종 판단해야 합니다.
