# 04. 여러 장소 묶음 처리와 동시 실행 제한

먼저 기억할 내용은 세 가지다.

1. 장소 후보를 최대 5개까지 Tool 한 번에 받는다.
2. 다섯 장소를 전부 한꺼번에 시작하지 않고 두 장소씩 처리한다.
3. 한 장소 안의 네 가지 데이터 조회는 서로 독립이므로 동시에 실행한다.

## 1) 기존 문제

기존 입력 형식은 `destination: string` 하나만 허용했다. MCP를 사용하는 프로그램(Host)이 서울
관광지 5개를 비교하려면 다음처럼
호출했다.

```text
Host 후보 5개 생성
├─ assess_accessible_visit("경복궁")
├─ assess_accessible_visit("창덕궁")
├─ assess_accessible_visit("덕수궁")
├─ assess_accessible_visit("경희궁")
└─ assess_accessible_visit("종묘")
```

MCP 호출 자체의 비용뿐 아니라 각 호출이 장소, 접근성, 날씨, 충전소, 축제를 따로 조회했다. 그렇다고
Tool만 하나로 합친 뒤 `Promise.all(destinations.map(4 APIs))`을 쓰면 최대 5×4개의 데이터 조회와
5개의 장소 검색이 한꺼번에 시작된다. Tool 호출 수는 줄어도 외부 API의 순간 부하는 커질 수 있다.

## 2) 적용한 해결 방법

기존 종합 Tool에 다음 두 입력 항목을 뒀다.

```typescript
destination?: string;
destinations?: string[]; // 1~5
```

`validateDestinationInput()`은 단일 장소와 여러 장소 중 정확히 하나만 입력되게 하고, 여러 장소와
`contentId`를 함께 쓰지 못하게 한다. `assessBatch()`는 공백과 대소문자를 정리해 중복을 제거하고
`mapWithConcurrency(..., 2, mapper)`로 두 후보씩 처리한다. 후보 하나의 장소가 확정되면 네 가지
데이터를 `Promise.allSettled`로 동시에 조회한다. 즉 최대 20개 작업을 무제한으로 시작하지 않고,
동시에 두 후보의 작업만 진행한다.

## 3) 핵심 개념

### 여기서 말하는 동시 처리란

Node.js는 외부 HTTP 응답을 기다리는 동안 다른 HTTP 작업도 진행할 수 있다. `Promise.all`은 작업
개수를 자동으로 제한하지 않기 때문에 입력된 작업을 모두 시작한다. 작업이 적을 때는 빠르지만,
많아지면 외부 API 호출 한도, 연결 수, 메모리 사용량과 매우 느린 요청이 늘어날 수 있다.

### 동시에 처리할 개수를 제한하는 이유

후보가 많으면 일부를 잠시 기다리게 해 외부 API에 작업이 한꺼번에 몰리지 않도록 한다. 이를
`backpressure`라고도 한다. 현재 `mapWithConcurrency`는 별도 라이브러리를 쓰지 않고 두 개의 작업
루프가 공유 `nextIndex`에서 후보를 하나씩 가져간다. 따라서 동시에 최대 두 후보만 실행된다.

### 순차·무제한 병렬·제한 병렬

```text
순차: 안정적이지만 5개의 응답 시간이 차례로 더해짐
Promise.all 5개: 빠를 수 있지만 순간 부하 최대
동시 처리 2개: 두 개씩 겹쳐 처리해 안정성과 응답 시간을 조절
```

### 이미 찾은 장소 정보 재사용

각 후보는 `DestinationResolver`를 한 번만 호출하고 확정된 `Destination` 객체를 네 service에
넘긴다. Service가 장소명을 다시 검색하지 않으며, LLM이 위경도를 직접 만들어 넘기지도 않는다.
같은 묶음 안에서 반복되는 축제·충전소·날씨 조회는 adapter의 cache key와 진행 중 요청 공유가
줄여 준다.

## 4) 실제 코드 흐름

```text
registerAssessAccessibleVisitTool
↓ destinations 존재
VisitAssessmentService.assessBatch
↓
normalizeDestinations
  "경복궁" / " 경복궁 " → 하나
↓
mapWithConcurrency(candidates, 2, async candidate => ...)
├─ 작업 1: candidate[0] → 완료 후 [2] → [4]
└─ 작업 2: candidate[1] → 완료 후 [3]
             ↓ 각 candidate
       DestinationResolver.resolve
             ↓
       assessResolvedDestination
             ↓ Promise.allSettled
       accessibility/weather/charger/festival
             ↓
       VisitAssessmentBatchItem
↓
입력 순서에 맞춰 results 배열 반환
↓
getBatchOverallStatus
```

`mapWithConcurrency`는 작업 완료 순서와 관계없이 `results[index]`에 저장하므로 Host가 준 후보
순서를 유지한다.

## 5) 왜 이 방법을 선택했는가

새 `assess_accessible_visits` Tool 대신 기존 Tool을 확장해 5개 Tool 이름 유지와 단일 호출 하위
호환성을 지켰다. `string | string[]` union은 Host parameter 생성이 불안정할 수 있어 명시적인 두
입력 항목을 사용했다. `p-limit` 라이브러리 대신 30줄 안팎의 직접 구현을 쓴 이유는 필요한 기능이
단순하고 새 라이브러리를 추가할 이득이 작기 때문이다.

후보 최대 5는 LLM이 비교 답변으로 다룰 수 있는 크기와 API 비용을 함께 고려한 값이다. 동시성 2는
한꺼번에 시작되는 작업 수를 크게 줄이면서 완전 순차보다 빠른 절충안이며 설정 파일에 한 번만
정의된다.

## 6) 장점과 한계

장점:

- Host의 Tool 호출 5→1
- 한 묶음 안에서 지역·날짜·기상 격자 데이터 공유 가능
- 한꺼번에 시작되는 외부 API 작업 수 제한
- 후보별 실패 격리와 입력 순서 유지

한계:

- 두 개씩 처리하므로 가짜 API가 모두 빠른 테스트에서는 `Promise.all` 5개보다 느릴 수 있음
- 최대 5개를 넘는 추천은 Host가 후보를 줄이거나 여러 요청으로 나눠야 함
- raw 배열이 6개면 중복 제거 후 5개여도 Zod max에서 먼저 거절됨
- batch `contentId[]`는 지원하지 않음; `contentId`는 기존 단일 입력만 지원
- 후보 resolve가 ambiguous면 그 후보는 평가하지 않고 후보 목록을 반환

## 7) 실패 상황

- 둘 다 없음/둘 다 있음: `INVALID_INPUT` structured result
- 빈 배열/6개 이상: Zod input validation 실패
- 중복: 안전한 정규화 후 한 번만 처리, count 로그로 확인
- 후보 한 개 not found: 그 item만 `NO_DATA`, 다른 item 유지
- 후보 한 개 ambiguous: 그 item에 최대 5개 후보 summary 반환
- Deadline 도중 대기 후보: mapper 시작 시 aborted signal을 보고 `FAILED` item 반환
- 데이터 한 종류 실패: 해당 장소의 나머지 결과는 남고 최상위 상태는 `PARTIAL_SUCCESS`가 될 수 있음

## 8) 테스트

`assess-accessible-visit.tool.test.ts`는 단일, destinations 1개/5개, 빈 배열, 6개, 둘 다 입력,
batch contentId를 검증한다. `visit-assessment.service.test.ts`는 6개 raw 입력 중 공백 중복 하나가
제거되어 5개가 되는지, active destination search가 2를 넘지 않는지 확인한다.
`concurrency.test.ts`는 공통 동시 처리 함수가 정해진 실행 개수를 넘지 않고 결과 순서를 유지하는지
검증한다.

## 9) 내가 반드시 이해해야 할 코드

- 파일: `src/mcp/tools/assess-accessible-visit.tool.ts`
  - 함수: `validateDestinationInput`
  - 왜 중요한지: schema로 표현하기 어려운 property 간 규칙을 명시한다.
- 파일: `src/application/services/visit-assessment.service.ts`
  - 함수: `assessBatch`, `normalizeDestinations`
  - 왜 중요한지: 중복 제거 후 두 후보씩 실행하고 결과를 합친다.
- 파일: `src/application/services/concurrency.ts`
  - 함수: `mapWithConcurrency`
  - 왜 중요한지: 무제한 `Promise.all`을 피하는 실제 동시 처리 제한 코드다.

## 10) 면접/설명용 정리

Host가 후보마다 Tool을 호출하던 구조를 기존 종합 Tool의 `destinations` 입력 하나로 줄였습니다.
Tool 호출만 합치고 모든 API를 `Promise.all`로 시작하면 외부 API의 순간 부하가 커지므로 후보는
두 개씩 처리합니다. 한 후보 안의 네 데이터 조회는 서로 독립이므로 동시에 실행합니다. 가장 빠른
한 번의 묶음 요청보다 외부 공공 API와 매우 느린 요청의 안정성을 우선한 설계입니다.
