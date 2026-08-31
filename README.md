# 보폭

> 이동약자의 관광지 방문 준비를 한 번에 돕는 MCP 서버

보폭은 장애인, 고령자, 영유아 동반자처럼 이동에 추가적인 준비가 필요한 사용자를 위해
관광지 정보를 모아 안내합니다. 사용자가 관광지와 방문일, 이동 조건을 자연어로 물으면
분산된 공공데이터를 조회해 **무장애 편의시설, 날씨, 전동휠체어 충전소, 축제 기반 혼잡 위험**을
종합하고 방문 전 유의사항과 체크리스트를 제공합니다.

## 이런 질문에 답합니다

1. 엄마랑 일요일에 수성못 유원지 가기로 했어. 엄마가 수동 휠체어를 타시는데 괜찮을까?
2. 오늘 할아버지랑 목포 해상케이블카 가는데 전동휠체어로 이동해도 문제 없겠지?
3. 9월 1일에 두 살 딸이랑 서울어린이대공원 가려고 하는데, 유모차 끌고 다니기 괜찮을까?

보폭은 장소명을 먼저 실제 관광지로 확정한 뒤 사용자의 이동 조건에 필요한 정보를 선별합니다.
한 가지 정보만 묻는 질문에는 전용 Tool을, 방문 가능 여부나 준비사항을 묻는 질문에는 종합 Tool을
사용합니다.

## 주요 기능

- **관광지 식별**: 정확히 일치하는 장소를 우선하며, 동명 장소는 임의로 선택하지 않습니다.
- **무장애 정보**: 접근로, 출입구, 엘리베이터, 장애인 화장실, 휠체어·유모차 관련 시설을
  확인합니다.
- **방문일 날씨**: 기상청 단기예보를 바탕으로 강수, 폭염, 한파 등 이동에 영향을 주는 위험을
  안내합니다.
- **주변 충전소**: 전동휠체어 급속충전소를 거리순으로 제공하고 운영정보와 데이터 기준일을 함께
  표시합니다.
- **행사 기반 혼잡 위험**: 방문일과 장소 주변의 축제를 확인해 교통·주차 혼잡 가능성을
  안내합니다.
- **종합 방문 평가**: 조회 가능한 결과를 조합해 방문 상태, 핵심 유의사항, 준비 체크리스트를
  반환합니다.

지원하는 이동 조건은 전동휠체어, 수동휠체어, 유모차, 고령자 동반입니다.

## 제공 Tool

| Tool                              | 역할                                                |
| --------------------------------- | --------------------------------------------------- |
| `get_destination_weather`         | 관광지와 방문일 기준 단기예보 및 날씨 유의사항 조회 |
| `find_nearby_wheelchair_chargers` | 관광지 주변 전동휠체어 급속충전소 조회              |
| `get_destination_accessibility`   | 관광지의 무장애 편의시설 조회                       |
| `get_destination_event_risk`      | 주변 축제에 따른 행사 기반 혼잡 위험 조회           |
| `assess_accessible_visit`         | 편의시설·날씨·충전소·축제를 결합한 종합 방문 평가   |

`assess_accessible_visit`는 단일 장소 평가와 최대 5개 후보 비교를 지원합니다. 최초 응답은 핵심만
담은 `SUMMARY`, 후속 설명은 상세 맥락을 제공하는 `DETAIL` 모드로 반환할 수 있습니다. 단일 장소의
`SUMMARY`가 성공하면 Kakao Tools용 compact Widget도 함께 제공합니다.

## 해결한 문제와 성능 개선

- **분산된 정보 통합**: 서로 다른 공공 API 응답을 공통 Domain 모델로 정규화해 한 번의 질문으로
  비교할 수 있게 했습니다.
- **불확실한 정보의 오해 방지**: 시설이 없다는 의미와 데이터가 제공되지 않았다는 의미를 구분하고,
  날씨 예보 범위 밖의 값은 추정하지 않습니다.
- **부분 실패 대응**: 독립 조회를 병렬 실행하고 일부 API가 실패하거나 지연돼도 확보한 결과는
  유지합니다.
- **중복 호출 감소**: 데이터 특성에 맞춘 TTL cache와 single-flight로 반복 요청 및 동시 동일 요청의
  외부 API 호출을 줄였습니다.
- **응답 지연 제한**: 종합 요청에 2.7초 deadline을 적용하고 후보를 최대 2개씩 처리해 과도한 동시
  호출을 방지합니다. 일시적 오류만 남은 시간 안에서 1회 재시도합니다.
- **축제 조회 최적화**: 성공 가능성이 낮았던 지역별 선행 호출을 제거하고 전국 dataset의 page 크기,
  cache, 날짜 index를 활용해 반복 스캔 비용을 줄였습니다.

구현 원리와 검증 수치는 [성능 및 확장성 분석](./PERFORMANCE.md), 학습용 상세 설명은
[성능 개선 문서](./docs/performance/README.md)에서 확인할 수 있습니다.

## 데이터와 안내 원칙

| 데이터                      | 출처                                  |
| --------------------------- | ------------------------------------- |
| 관광지 검색·무장애 편의시설 | 한국관광공사 TourAPI                  |
| 방문일 날씨                 | 기상청 단기예보                       |
| 전동휠체어 충전소           | 전국 전동휠체어 급속충전기 표준데이터 |
| 주변 축제                   | 전국문화축제표준데이터                |

- 빈 값은 기본적으로 `NOT_PROVIDED`로 처리하며 명시적인 부재와 구분합니다.
- 충전소의 실시간 작동 여부나 현재 사용 가능 여부는 보장하지 않습니다.
- 축제 결과는 실시간 유동인구가 아닌 행사 기간과 거리를 바탕으로 한 위험 신호입니다.
- 과거 날짜이거나 단기예보에 포함되지 않은 날짜의 날씨는 임의로 생성하지 않습니다.
- 보폭의 결과는 방문 준비를 돕는 참고 정보이며, 중요한 시설은 방문 전 운영기관에 다시 확인하는
  것을 권장합니다.

## 구조

보폭은 Tool과 외부 API를 직접 연결하지 않고 Application Service와 Repository Port를 사이에 둡니다.
덕분에 외부 DTO가 핵심 모델로 퍼지는 것을 막고, 사용자 의도에 따른 조합과 부분 실패 처리를
Application 계층에서 담당합니다.

```text
main / bootstrap
→ MCP Tool
→ Application Service
→ Repository Port
← Infrastructure Adapter
→ External API
```

```text
src/
├─ bootstrap/       # 서버 생성, 의존성 조립, Tool 등록
├─ mcp/             # Tool schema와 handler, Widget
├─ application/     # 사용자 기능과 Repository Port
├─ infrastructure/  # 공공 API client, DTO, mapper, adapter
└─ domain/          # 외부 기술에 독립적인 핵심 모델
```

DB나 사용자별 상태 저장소는 사용하지 않으며, 외부 API 결과는 요청 범위에서만 조합합니다.
성능 cache는 프로세스 메모리의 제한된 TTL cache이며 사용자 이력을 저장하지 않습니다.

## 실행하기

### 요구 환경

- Node.js 24
- npm 10 이상

### 환경변수

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

선택 값으로 `FESTIVAL_API_FULL_SCAN_PAGE_SIZE`, HTTP 실행 시 `PORT`를 사용할 수 있습니다.
애플리케이션은 `process.env`만 읽으며 `dotenv` 같은 환경변수 파일 loader를 사용하지 않습니다.
로컬의 `start:local` 명령은 Node.js 내장 옵션으로 `.env` 값을 `process.env`에 주입합니다.

### 설치 및 실행

```bash
npm ci
npm run build
```

stdio MCP 서버:

```bash
node dist/main.js
```

로컬 Streamable HTTP 서버 (`http://localhost:3000/mcp`):

```bash
npm run start:local
```

운영 환경에서는 외부에서 환경변수를 주입한 뒤 `npm run start:http`를 사용합니다.

## 검증

```bash
npm run typecheck
npm run lint
npm run build
```

요청 단위 로그와 성능 흐름을 로컬에서 확인하려면 `npm run dev:observe`를 실행한 뒤
`npm run logs`를 사용할 수 있습니다. 로그에는 API key, 인증 query, 원본 API 응답을 남기지
않습니다.