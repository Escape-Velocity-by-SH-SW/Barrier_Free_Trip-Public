# 02. 서버 메모리 Cache

먼저 기억할 내용은 세 가지다.

1. 자주 반복되는 조회 결과를 Node.js 메모리에 잠시 저장한다.
2. 저장 시간과 개수를 모두 제한해 오래된 데이터와 메모리 증가를 막는다.
3. Cache가 비어 있거나 사라져도 원래 외부 API를 다시 호출하므로 기능은 계속 동작한다.

## 1) 기존 문제

기존 adapter에는 이전 결과를 기억하는 구조가 없었다.

```text
사용자 A: "경복궁"
→ searchKeyword2

사용자 B: "경복궁"
→ 동일 searchKeyword2

같은 사용자의 다음 요청
→ 다시 동일 searchKeyword2
```

전국 축제 데이터, 종로구 충전소, 같은 기상청 격자의 예보, 같은 `contentId`의 접근성 정보도
반복해서 조회했다. `Map` 하나를 제한 없이 쓰면 재조회는 줄지만, key가 계속 늘어 메모리가 부족해질 수 있고 오래된
날씨를 영구 반환할 수 있다.

## 2) 적용한 해결 방법

`src/infrastructure/cache/bounded-ttl-cache.ts`에 `BoundedTtlCache<TKey, TValue>`를 추가했다.

- `Map`에 value와 `expiresAt`을 함께 저장한다.
- `get()`에서 TTL을 확인하고 만료된 entry를 삭제한다.
- hit된 entry를 Map 끝으로 옮겨 최근 사용 순서를 갱신한다.
- `set()` 후 `maxEntries`를 넘으면 가장 오래 사용되지 않은 key부터 삭제한다.
- Cache에서 오류가 나면 `CachedLoader`가 원래 외부 조회 함수를 실행한다. 따라서 cache 오류가 전체
  기능 오류로 이어지지 않는다.

실제 설정은 `performance-config.ts` 한 곳에 있다.

| 데이터         | 구분에 쓰는 값(key)                             | 저장 시간(TTL) | 최대 개수 |
| -------------- | ----------------------------------------------- | -------------: | --------: |
| 장소 검색      | 정리한 관광지 이름                              |         24시간 |       256 |
| 접근성         | `contentId`, `contentTypeId`                    |         12시간 |       512 |
| 전국 축제      | `nationwide`                                    |          6시간 |         1 |
| 축제 날짜 목록 | `visitDate`                                     |          6시간 |        32 |
| 충전소         | 정리한 `province`, `cityCounty`                 |           30분 |        64 |
| 날씨           | `nx`, `ny`, `baseDate`, `baseTime`, `visitDate` |           10분 |       256 |

## 3) 핵심 개념

### Node.js가 실행되는 동안 사용하는 메모리

Node.js를 실행하면 운영체제에 하나의 실행 단위(process)가 생긴다. JavaScript 객체, `Map`,
`Promise`는 이 실행 단위가 사용하는 메모리에 저장된다. Docker container 하나는 보통 이 Node.js
process 하나를 실행한다.
`createContainer()`는 HTTP server 시작 시 한 번 호출되므로 그 안에서 생성한 adapter와 cache도
해당 process 생명주기 동안 재사용된다.

### Map과 cache의 차이

Map은 key/value 저장 자료구조일 뿐이다. 현재 구현이 cache인 이유는 다음 정책이 추가됐기
때문이다.

- 언제 오래됐다고 볼지: TTL
- 얼마나 저장할지: `maxEntries`
- 가득 찼을 때 무엇을 버릴지: 가장 오래 사용하지 않은 값부터 삭제하는 LRU 방식
- 값이 없을 때 어디서 다시 가져올지: adapter가 호출하는 외부 API
- Cache 오류가 날 때 어떻게 처리할지: cache를 건너뛰고 외부 API 조회

### Cache에 값이 있을 때와 없을 때

- Cache hit: key가 있고 저장 시간이 남아 있어 즉시 반환하는 경우
- Cache miss: key가 없거나 만료되어 외부 API를 조회하는 경우
- 비어 있는 cache(cold cache): 서버 시작 직후처럼 저장된 값이 없는 상태
- 채워진 cache(warm cache): 반복 요청에 필요한 값이 저장된 상태

### 저장 시간(TTL)과 만료 처리

TTL은 `set()`으로 저장한 시점부터 값이 유효한 시간이다. 별도 작업이 계속 만료 값을 찾는 방식이
아니라, 다음 `get()`에서 값을 읽을 때 만료 여부를 확인하고 삭제한다. 그래서 별도의 백그라운드
프로그램이 필요 없다.

### 저장 공간이 가득 찼을 때 삭제하는 방법

TTL은 오래된 데이터를 쓰지 않게 하고, `maxEntries`와 LRU는 저장 개수를 제한한다. 서로 목적이
다르다. 저장 시간이 남아 있어도 cache가 가득 차면 가장 오래 사용하지 않은 값이 삭제될 수 있다.

### Stateless인데 메모리를 써도 되는가

Stateless는 다음 요청의 정상 처리 여부가 이전 요청에서 저장한 값에 의존하지 않는다는 뜻이다.
보폭 cache에는 로그인 정보, 사용자 선택 같은 필수 상태를 저장하지 않는다. 값이 있으면 같은 공공데이터 조회를
생략하고, 없으면 원래 API를 호출한다. 그러므로 cache 전체가 사라져도 결과를 계산할 수 있어
stateless와 모순되지 않는다.

### 서버가 여러 개 실행되면 어떻게 되는가

동시에 실행되는 서버 복제본 A와 B는 각각 독립된 Node.js process와 cache를 가진다. A에 저장된
값을 B는 알 수 없다. 따라서 서버 전체에서 외부 API가 정확히 한 번만 호출된다고 보장하지 않는다.
다만 각 서버 안의 반복 호출은 줄고, cache 유무와 관계없이 기능 결과는 같다.

### Redis와 차이

Redis는 Node.js process 밖에서 실행되므로 여러 서버가 값을 공유할 수 있다. 대신 Redis까지 가는
네트워크 통신, 데이터 변환, 운영과 인증, 장애 처리도 필요해진다. 현재 대회 조건은 크지 않은 읽기
전용 데이터와 단일 Docker image 배포이므로 서버 내부 cache의 비용 대비
효과가 더 좋다고 판단했다.

## 4) 실제 코드 흐름

Destination 예시:

```text
DestinationResolver.resolve(" 경복궁 ", context)
↓ keyword trim
KoreaTourAccessibilityAdapter.searchDestination
↓ normalizeCacheKey → "경복궁"
CachedLoader.load(key, context, factory)
├─ BoundedTtlCache.get hit → candidates 반환
└─ miss
   ↓
   같은 key의 진행 중 요청 목록 확인
   ↓ 없으면
   KoreaTourApiClient.searchKeyword
   ↓ /searchKeyword2
   mapper → DestinationCandidate[]
   ↓
   BoundedTtlCache.set
   ↓
   resolver가 unique exact match 선택
```

Weather 예시:

```text
KmaWeatherAdapter.getForecast
↓ lat/lng → nx/ny
↓ 현재 KMA baseDate/baseTime 계산
key = nx|ny|baseDate|baseTime|visitDate
↓
CachedLoader
↓ miss일 때만 KmaWeatherApiClient.getForecast
```

동일 격자에 속한 가까운 관광지는 실제 위경도가 달라도 같은 key를 사용할 수 있다.

## 5) 왜 이 방법을 선택했는가

Redis보다 process cache를 택한 이유는 새 infrastructure 없이 `createContainer()`가 이미 재사용하는
adapter 생명주기에 자연스럽게 붙일 수 있기 때문이다. 모든 API를 하나의 generic repository
decorator로 감싸기보다 key를 가장 잘 아는 adapter에 `CachedLoader`를 배치했다. 예를 들어 weather
key에는 변환된 KMA 격자와 발표시각이 필요하고 festival은 전국 dataset/date index라는 고유 구조가
있다.

## 6) 장점과 한계

장점:

- 외부 API 호출 없이 저장된 값을 빠르게 반환
- 새 라이브러리나 운영용 서버를 추가하지 않음
- 한 서버의 cache 문제가 다른 서버로 퍼지지 않음
- 데이터별 key/TTL을 정확히 설계 가능

한계:

- container 재시작과 재배포 뒤에는 cache가 비어 있음
- 여러 서버가 cache를 공유하지 않음
- `maxEntries`는 entry 수 상한이지 정확한 byte 상한은 아님
- TTL 동안 외부 데이터 변경을 즉시 반영하지 못함
- 전국 축제 데이터를 처음 받는 작업은 여전히 오래 걸릴 수 있음

## 7) 실패 상황

- 값 만료: `get()`이 삭제한 뒤 외부 API를 다시 조회한다.
- LRU 삭제: 다음 요청에서 외부 API를 다시 조회할 뿐 기능 오류는 아니다.
- Container 재시작: 모든 값이 사라져도 외부 API로 정상 조회한다.
- Cache `get/set` 예외: `CachedLoader`가 cache 오류를 서비스 실패로 전파하지 않는다.
- 외부 API 실패: 실패 Promise는 cache하지 않는다. 다음 요청은 다시 시도할 수 있다.
- 여러 서버: 각 서버가 처음에는 외부 API를 한 번씩 호출할 수 있지만 기능 결과는 같다.

## 8) 테스트

`bounded-ttl-cache.test.ts`는 값이 없을 때와 있을 때, 저장 시간 만료, 오래 사용하지 않은 값 삭제,
저장 개수 상한을 검증한다.
`korea-tour-accessibility.adapter.test.ts`는 실제 adapter/resolver 경로에서 10개 동시 요청이 외부
search 한 번으로 줄어드는지를 검증한다. `festival.adapter.test.ts`는 같은 날짜의 관광지 5개가 전국
dataset을 한 번만 받는지 확인한다.

## 9) 내가 반드시 이해해야 할 코드

- 파일: `src/infrastructure/cache/bounded-ttl-cache.ts`
  - 함수: `get`, `set`
  - 왜 중요한지: TTL과 LRU가 Map을 bounded cache로 바꾸는 지점이다.
- 파일: `src/application/services/performance-config.ts`
  - 값: `performanceConfig.cache`
  - 왜 중요한지: 데이터 성격별 TTL/entry 결정을 한눈에 보여준다.
- 파일: `src/infrastructure/weather/kma-weather.adapter.ts`
  - 함수: `getForecast`
  - 왜 중요한지: raw 위경도가 아니라 KMA grid/base time을 key로 삼은 실제 사례다.

## 10) 면접/설명용 정리

보폭의 cache는 Node.js가 실행되는 동안 메모리에 결과를 잠시 저장하며, 로그인 정보를 보관하는
저장소가 아닙니다. Cache가 없거나 만료되면 기존 공공 API를 다시 호출하므로 기능은 정상
동작합니다. TTL은 오래된 값을 막고, 최대 개수와 LRU는 메모리가 계속 커지는 것을 막습니다. 실행
중인 서버마다 cache가 따로 있다는 한계는 있지만, Redis 운영 없이 반복 호출을 크게 줄였습니다.
