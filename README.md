# Accessible Visit MCP

장애인, 고령자, 유모차 동반자 등 이동약자가 관광지를 방문하기 전에 필요한 정보를 한 번에 확인할 수 있도록 지원하는 MCP 서버입니다.

사용자가 관광지, 방문일, 이동 조건을 자연어로 입력하면 LLM이 적절한 Tool을 호출하고, 서버는 공공데이터를 조회해 편의시설, 날씨, 전동휠체어 충전소, 축제 기반 혼잡 위험과 종합 유의사항을 반환합니다.

## 프로젝트 목표

관광지를 방문하려는 이동약자가 여러 공공데이터 사이트를 각각 검색하지 않고도 다음 질문에 답을 얻을 수 있도록 하는 것이 목표입니다.

```text
오늘 전동휠체어로 경복궁에 갈 건데 유의사항 알려줘.
```

서버는 다음 정보를 제공합니다.

- 관광지 무장애 편의시설
- 방문일 단기예보와 이동 관련 주의사항
- 주변 전동휠체어 급속충전소
- 주변 축제 기반 혼잡 위험
- 방문 전 확인사항과 준비 체크리스트

## 프로젝트 구현 의도

### 사용자 의도 중심의 Tool 설계

외부 API를 그대로 Tool로 노출하지 않고 사용자가 실제로 묻는 목적을 기준으로 Tool을 설계합니다.

예를 들어 날씨만 묻는 요청은 날씨 Tool이 처리하고, 여러 정보를 포함한 방문 유의사항 요청은 종합 Tool이 처리합니다.

### 서로 다른 공공데이터의 통합

각 공공데이터는 서로 다른 필드와 응답 구조를 사용합니다.

서버는 이를 공통 형식으로 정규화하여 LLM이 원본 API 구조를 직접 해석하지 않아도 일관된 답변을 생성할 수 있도록 합니다.

### 이동 조건을 반영한 유의사항 제공

같은 날씨와 관광지라도 사용자의 이동 조건에 따라 중요한 정보가 달라질 수 있습니다.

지원하는 이동 조건은 다음과 같습니다.

```typescript
type TravelerType = "POWER_WHEELCHAIR" | "MANUAL_WHEELCHAIR" | "STROLLER" | "ELDERLY_COMPANION";
```

예:

- 전동휠체어 이용자: 충전소, 경사로, 엘리베이터
- 수동휠체어 이용자: 접근로, 노면 상태, 강풍
- 유모차 동반자: 엘리베이터, 유모차 대여, 수유실
- 고령자 동반자: 이동 거리, 휴식 공간, 날씨 위험

### 확인되지 않은 정보의 명확한 표현

공공데이터에 값이 없다는 이유만으로 시설이 없다고 단정하지 않습니다.

```text
CONFIRMED      확인된 정보
NOT_AVAILABLE  없다고 명시된 정보
NOT_PROVIDED   데이터가 제공되지 않은 정보
```

충전소 데이터 역시 실시간 작동 여부를 보장하지 않으며, 축제 정보는 실시간 유동인구가 아닌 행사 기반 혼잡 가능성으로 안내합니다.

### 종합 질문에 대한 부분 성공 지원

종합 조회 중 일부 데이터 호출이 실패하더라도 조회에 성공한 나머지 정보는 유지하여 반환하는 것을 목표로 합니다.

## 제공 Tool

### `get_destination_weather`

관광지와 방문일을 기준으로 단기예보와 이동 관련 날씨 유의사항을 조회합니다.

사용 예시:

```text
내일 경복궁 날씨 괜찮아?
유모차로 방문할 건데 비가 올까?
```

주요 입력:

```typescript
{
  destination: string;
  visitDate: string;
  travelerType?: TravelerType;
}
```

주요 결과:

- 방문일 일별 예보
- 일 최저·최고기온
- 최대 강수확률, 최대 1시간 강수량, 강수형태
- 강수, 폭염, 한파 등 이동 관련 날씨 위험
- 이동 조건별 날씨 유의사항

과거 방문일이거나 단기예보 응답에 방문일이 포함되지 않은 경우 날씨를 임의로 추정하지 않습니다.

---

### `find_nearby_wheelchair_chargers`

관광지 주변의 전동휠체어 급속충전소를 조회합니다.

사용 예시:

```text
경복궁 근처 전동휠체어 충전소 알려줘.
반경 5km 안에 충전할 곳이 있어?
```

주요 입력:

```typescript
{
  destination: string;
  radiusKm?: number;
  visitDateTime?: string;
}
```

주요 결과:

- 충전소명
- 관광지와의 거리
- 주소와 설치 위치
- 운영시간
- 동시 사용 가능 대수
- 관리기관과 연락처

충전소의 실시간 작동 여부와 현재 사용 가능 여부는 보장하지 않습니다.

`radiusKm`(기본 3km)을 벗어난 충전소는 결과에서 제외됩니다. 데이터기준일자가 180일(6개월)을 초과한 충전소는 `dataFreshness: STALE`로 표시되며, 방문 전 운영 여부를 다시 확인하라는 유의사항이 함께 반환됩니다.

---

### `get_destination_accessibility`

관광지의 무장애 편의시설 정보를 조회합니다.

사용 예시:

```text
경복궁에 장애인 화장실이 있어?
전동휠체어로 이용 가능한 편의시설을 알려줘.
```

주요 입력:

```typescript
{
  destination: string;
  travelerType?: TravelerType;
}
```

주요 결과:

- 장애인 주차장
- 접근로
- 출입구
- 엘리베이터
- 장애인 화장실
- 휠체어 대여
- 유모차 관련 시설
- 수유실
- 확인되지 않은 정보

---

### `get_destination_event_risk`

방문일에 관광지 주변에서 진행되는 축제를 조회하고 행사 기반 혼잡 위험을 반환합니다.

사용 예시:

```text
이번 주말 경복궁 주변에 축제가 있어?
행사 때문에 주차가 어려울 가능성이 있을까?
```

주요 입력:

```typescript
{
  destination: string;
  visitDate: string;
  radiusKm?: number;
}
```

주요 결과:

- 주변 축제 목록
- 축제 개최 기간
- 관광지와 축제 간 거리
- 행사 기반 혼잡 위험
- 주차 및 교통 관련 유의사항

위험 단계는 다음과 같습니다.

```text
LOW
MEDIUM
HIGH
UNKNOWN
```

이 값은 실시간 혼잡도가 아니라 축제 기간과 거리를 기반으로 한 위험 신호입니다.

---

### `assess_accessible_visit`

편의시설, 날씨, 충전소, 축제 정보를 함께 조회하여 종합 방문 유의사항을 반환합니다.

사용 예시:

```text
오늘 전동휠체어로 경복궁에 갈 건데 유의사항 알려줘.
내일 유모차로 불국사에 가도 괜찮을까?
방문 전에 무엇을 준비해야 해?
```

주요 입력:

```typescript
{
  destination: string;
  visitDate: string;
  travelerType: TravelerType;
  radiusKm?: number;
}
```

주요 결과:

- 확정된 관광지 정보
- 무장애 편의시설
- 방문일 날씨
- 주변 전동휠체어 충전소
- 축제 기반 혼잡 위험
- 종합 방문 상태
- 주요 유의사항
- 확인되지 않은 정보
- 방문 준비 체크리스트
- 관리기관에 확인할 질문

종합 방문 상태는 다음 중 하나로 반환합니다.

```text
LIKELY_ACCESSIBLE
ACCESSIBLE_WITH_CAUTION
CHECK_REQUIRED
INSUFFICIENT_DATA
```

## 대표 동작 예시

사용자 요청:

```text
오늘 전동휠체어로 경복궁에 갈 건데 유의사항 알려줘.
```

선택되는 Tool:

```text
assess_accessible_visit
```

Tool 입력 예시:

```json
{
  "destination": "경복궁",
  "visitDate": "2026-06-25",
  "travelerType": "POWER_WHEELCHAIR",
  "radiusKm": 3
}
```

서버는 편의시설, 날씨, 충전소, 축제 정보를 조회한 뒤 다음 내용을 포함한 구조화된 결과를 반환합니다.

- 전동휠체어 이동에 필요한 편의시설
- 우천·강풍·고온 등 날씨 주의사항
- 가까운 충전소와 운영정보
- 주변 축제에 따른 교통·주차 위험
- 여러 정보를 결합한 종합 유의사항
- 출발 전 준비 체크리스트

## 프로젝트 범위

현재 MVP는 관광지 방문 전에 필요한 정보를 제공하는 데 집중합니다.

포함 범위:

- 관광지명 기반 장소 식별
- 무장애 편의시설 조회
- 방문일 기준 단기예보 조회와 날씨 위험 판단
- 주변 충전소 조회
- 주변 축제 조회
- 종합 유의사항 생성

포함하지 않는 범위:

- 실시간 유동인구
- 충전소 실시간 작동 상태
- 실제 휠체어 이동 경로 안내
- 도로 턱과 경사도 분석
- 사용자 계정과 방문 이력
- 데이터 영구 저장

## 런타임 환경변수

서버는 환경변수 파일을 읽지 않습니다. 배포 환경에서 MCP 서버 컨테이너를 실행할 때
다음 환경변수를 직접 주입해야 합니다.

필수 환경변수:

```text
TOUR_API_BASE_URL
TOUR_API_SERVICE_KEY
KMA_WEATHER_API_BASE_URL
KMA_WEATHER_API_SERVICE_KEY
WHEELCHAIR_CHARGER_API_BASE_URL
WHEELCHAIR_CHARGER_API_SERVICE_KEY
FESTIVAL_API_BASE_URL
FESTIVAL_API_SERVICE_KEY
```

선택 환경변수:

```text
FESTIVAL_API_FULL_SCAN_PAGE_SIZE
FESTIVAL_API_FOCUSED_PER_PAGE
PORT
```

필수 값은 서버 시작 시 검증되며, 누락되면 서버가 시작되지 않습니다. `PORT`는 HTTP 실행
진입점에서만 사용하며 기본값은 `3000`입니다.

다음 비민감 설정은 컨테이너 환경변수 개수를 줄이기 위해 코드에 고정되어 있으므로 주입하지
않습니다.

```text
API_TIMEOUT_MS=3000
WHEELCHAIR_CHARGER_API_ENDPOINT_PATH=/tn_pubr_public_electr_whlchairhgh_spdchrgr_api
KMA_WEATHER_API_ENDPOINT_PATH=/getVilageFcst
TOUR_API_MOBILE_OS=ETC
TOUR_API_MOBILE_APP=BarrierFreeTrip
TOUR_API_DEFAULT_NUM_OF_ROWS=10
FESTIVAL_API_ENDPOINT_PATH=/openapi/tn_pubr_public_cltur_fstvl_api
FESTIVAL_API_DEFAULT_PER_PAGE=1000
```

## 기대 효과

이 프로젝트는 분산된 공공데이터를 사용자 목적에 맞게 결합하여 이동약자가 관광지 방문 전 다음 항목을 더 쉽게 판단할 수 있도록 돕습니다.

- 현재 조건으로 방문해도 괜찮은지
- 어떤 편의시설을 사용할 수 있는지
- 날씨로 인해 이동 위험이 있는지
- 전동휠체어 충전 계획이 필요한지
- 축제로 인해 주차와 교통이 혼잡할 가능성이 있는지
- 방문 전 어떤 내용을 전화로 확인해야 하는지
