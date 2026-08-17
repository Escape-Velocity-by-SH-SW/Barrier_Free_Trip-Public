# 03. 진행 중인 같은 요청 공유(Single-flight)

먼저 기억할 내용은 세 가지다.

1. Cache가 있어도 값이 저장되기 전에 같은 요청이 동시에 들어오면 외부 API가 중복 호출될 수 있다.
2. 같은 key의 진행 중인 `Promise`를 공유해 중복 호출을 한 번으로 줄인다.
3. 실패한 작업은 저장하지 않고 목록에서도 지워 다음 요청이 다시 시도할 수 있게 한다.

## 1) 기존 문제

Cache만 추가해도 동시에 들어온 요청은 다음과 같은 실행 순서 문제를 만든다.

```text
10명의 "경복궁" 요청
↓ 거의 같은 시점
10개 모두 cache.get("경복궁") → miss
↓
10개 모두 searchKeyword2 시작
```

첫 요청이 API 결과를 cache에 저장하기 전에 나머지 요청도 값이 없다고 판단했기 때문이다. 인기
관광지나 cache 만료 직후에 이렇게 같은 외부 API가 한꺼번에 호출되는 현상을 `cache stampede`라고
한다.

## 2) 적용한 해결 방법

`CachedLoader<TKey, TValue>`에 두 저장소를 둔다.

```text
cache: BoundedTtlCache<Key, Value>
inFlight: Map<Key, Promise<Value>>
```

Cache에 값이 없을 때 `inFlight.get(key)`가 있으면 새 API를 호출하지 않고 같은 `Promise`를
기다린다. 없으면 실제 조회 함수(`factory`)를 실행해 만든 `Promise`를 `Map`에 넣는다. 성공한 값만
cache에 저장하고, 성공·실패와 관계없이 `finally`에서 진행 중 목록을 정리한다. 목록이
`maxInFlight`보다 커지면 메모리 보호를 위해 공유를 생략하고 실제 조회 함수를 바로 실행한다.

## 3) 핵심 개념

### 동시에 들어온 요청이 Promise를 공유하는 방법

Node.js는 외부 응답을 기다리는 동안 다른 요청도 처리할 수 있다. `Promise`는 나중에 받을 성공
값이나 실패를 나타낸다. 여러 호출자가 같은 `Promise`를 기다리면 HTTP 요청을 여러 번 만들지 않고
한 요청의 결과를 함께 받는다.

### Cache와 single-flight가 담당하는 시점

```text
과거 완료 결과 재사용: cache
현재 진행 중 작업 재사용: single-flight
```

Single-flight 결과가 성공하면 cache가 이후 요청을 담당한다. 실패하면 cache에는 쓰지 않고
in-flight만 정리한다.

### 같은 요청이 다시 시작되지 않게 하는 순서

중요한 순서는 `실제 조회 시작 → inFlight.set → 호출자에게 Promise 반환`이다. 바로 뒤에 온 호출자는
`Map`에 등록된 `Promise`를 발견해 함께 기다릴 수 있다. `finally`에서 지우지 않으면 실패한
`Promise`가 계속 남아 이후 요청도 과거의 같은 실패를 받게 된다.

### 공유한 요청이 실패하면

공유한 `Promise`가 실패하면 이를 기다린 호출자도 실패를 받는다. 상위 service는 이를 기존 정책대로
`FAILED` 또는 부분 결과로 바꾼다. 실패는 cache에 저장하지 않으므로 다음 요청은 새
외부 조회를 시작할 수 있다.

## 4) 실제 코드 흐름

```text
CachedLoader.load("경복궁", context, factory)
↓
readCache
├─ value 존재 → cache hit 기록 → 반환
└─ 없음 → cache miss 기록
             ↓
       inFlight.get("경복궁")
       ├─ Promise 존재
       │  → singleFlightJoin 기록
       │  → 같은 Promise 반환
       └─ 없음
          → factory() 실행
          → promise.then(writeCache)
          → promise.finally(inFlight.delete)
          → inFlight.set(key, promise)
          → 반환
```

실제 대상은 장소 검색, 접근성, 지역 charger, KMA weather key, 전국 festival dataset, festival 날짜
index다. 모든 HTTP method를 기계적으로 감싼 것이 아니라 반복 가능성이 높은 dataset 경계에
적용했다.

## 5) 왜 이 방법을 선택했는가

Mutex로 전체 cache를 잠그면 서로 다른 `경복궁`과 `불국사` 요청까지 직렬화된다. 현재 방식은
key별 Promise를 공유하므로 같은 key만 합치고 다른 key는 동시에 처리한다. 외부 `p-limit` 같은
dependency는 single-flight 문제를 직접 풀지 않으며, 구현이 짧고 명확해 dependency를 추가하지
않았다.

## 6) 장점과 한계

장점:

- Cache에 값이 없을 때 외부 API 호출을 10→1처럼 줄임
- 인기 관광지 요청이 몰릴 때 외부 API 보호
- 성공 후 cache와 자연스럽게 연결
- key별이므로 다른 데이터 요청을 막지 않음

한계:

- 같은 Node process 안에서만 공유
- 먼저 시작한 작업의 `OperationContext`/AbortSignal을 loader가 사용하므로 그 작업이 취소되면
  같은 작업을 기다린 다른 요청도 함께 실패할 수 있음
- 서로 다른 normalization key는 합쳐지지 않음
- `maxInFlight` 초과 시 메모리 보호를 위해 중복 외부 요청이 발생할 수 있음

두 번째 한계는 현재 구현의 실제 특성이다. 요청마다 취소를 완전히 분리하려면 최초 요청과 독립된
종료 시간을 만들고 각 요청의 대체 처리를 따로 구현해야 한다. 전체 종료 시간 뒤에 HTTP 작업을
남기지 않는 현재 목표에 비해 복잡도가 커 이번에는 넣지 않았다.

## 7) 실패 상황

- 실제 조회 실패: 기다린 요청 모두 실패, `finally`로 진행 중 목록 제거, cache에는 미저장
- Cache set 실패: 값은 현재 caller에게 반환되지만 다음 요청은 miss가 될 수 있음
- 최초 요청 취소: 공유 HTTP 요청도 실패할 수 있고 상위 service가 부분 실패로 처리
- 진행 중 목록 포화: 공유를 생략하고 정상적으로 실제 조회 실행
- Process 재시작: 진행 중 목록과 cache가 모두 사라지지만 새 요청은 정상 조회

## 8) 테스트

`bounded-ttl-cache.test.ts`의 single-flight 테스트는 같은 key를 10번 동시에 `load()`하고 factory가
한 번 호출되는지 확인한다. 이어진 요청은 cache hit라 factory 호출 수가 계속 1이다. 별도 테스트는
첫 Promise를 reject시킨 뒤 두 번째 load가 성공하는지 확인해 failed in-flight cleanup을 검증한다.
Tourism adapter test도 `DestinationResolver.resolve("경복궁")` 10개를 실행해 `searchKeyword` 한
번을 검증한다.

## 9) 내가 반드시 이해해야 할 코드

- 파일: `src/infrastructure/cache/cached-loader.ts`
  - 함수: `load`
  - 왜 중요한지: cache hit, in-flight join, factory, cleanup의 전체 상태 전이가 있다.
- 파일: `src/infrastructure/cache/bounded-ttl-cache.test.ts`
  - 테스트: `shares one in-flight lookup...`
  - 왜 중요한지: 같은 요청 10개가 외부 API 호출 1개를 공유하는지 가장 직접 보여준다.
- 파일: `src/infrastructure/tourism/korea-tour-accessibility.adapter.test.ts`
  - 테스트: concurrent destination resolution
  - 왜 중요한지: generic utility가 실제 adapter 경로에서도 동작함을 보여준다.

## 10) 면접/설명용 정리

Cache만으로는 저장 시간이 끝난 직후 동시에 들어온 요청이 모두 외부 API를 호출하는 문제를 막지
못합니다. 그래서 key별로 진행 중인 `Promise`를 `Map`에 저장하고, 같은 key의 요청이 함께
기다리도록 했습니다. 성공한 결과만 cache에 넣고 성공·실패 모두 `finally`에서 목록을 정리합니다.
이 기능은 같은 Node.js process 안에서만 동작하지만 인기 관광지의 순간 중복 호출을 크게 줄입니다.
