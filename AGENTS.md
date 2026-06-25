# AGENTS.md

## Project

이 프로젝트는 이동약자의 관광지 방문 준비를 돕는 TypeScript 기반 MCP 서버다.

제공 정보:
- 무장애 편의시설
- 기상청 단기예보
- 주변 전동휠체어 충전소
- 주변 축제 기반 혼잡 위험
- 종합 방문 유의사항

DB는 사용하지 않는다. 외부 API 결과는 요청 범위에서만 조합한다.

## MCP Tools

반드시 다음 5개 Tool을 유지한다.

- `get_destination_weather`
- `find_nearby_wheelchair_chargers`
- `get_destination_accessibility`
- `get_destination_event_risk`
- `assess_accessible_visit`

Tool은 API 단위가 아니라 사용자 의도 단위다.
개별 질문은 개별 Tool, 유의사항·방문 가능 여부·준비사항은 종합 Tool이 처리한다.

## Project Structure

```text
src/
├─ mcp/tools/
├─ application/
│  ├─ ports/
│  └─ services/
├─ infrastructure/
│  ├─ tourism/
│  ├─ weather/
│  ├─ charger/
│  └─ festival/
└─ domain/
```

현재 디렉터리 구조를 유지한다. 임의로 새 계층을 추가하지 않는다.

## Dependency Direction

```text
MCP Tool
→ Application Service
→ Repository Port
← Infrastructure Adapter
→ External API
```

허용:
- `mcp → application`
- `application → domain`
- `infrastructure → application/ports`
- `infrastructure → domain`

금지:
- `domain → infrastructure`
- `application → concrete adapter`
- `application → external DTO`
- Tool에서 다른 Tool 호출
- Service에서 Tool 호출
- Tool Handler에서 직접 `fetch`

## Responsibilities

### MCP Tool
- Tool description
- Zod input/output Schema
- Application Service 호출
- `structuredContent` 반환
- 비즈니스 로직 금지

### Application Service
- 사용자 기능 수행
- Repository Port 호출
- 결과 조합과 부분 실패 처리

### Repository Port
- 외부 데이터 접근 계약
- API URL, 인증키, 외부 필드명 노출 금지

### Infrastructure
- Client: HTTP 요청
- DTO: 외부 응답 타입
- Mapper: DTO를 내부 타입으로 변환
- Adapter: Repository Port 구현

### Domain
- 핵심 타입과 결과 모델
- MCP SDK, HTTP, 환경변수, 외부 DTO 의존 금지

## Main Components

### DestinationResolver
장소명을 확정된 `Destination`으로 변환한다.

- `/searchKeyword2` 호출
- 정확 일치 우선
- 결과 없음 처리
- 복수 후보 처리
- `contentId`, 주소, 위경도 반환, 관광지 사진
- 첫 번째 검색 결과를 무조건 선택하지 않음 

### VisitAssessmentService
종합 요청 오케스트레이터다.

```text
DestinationResolver
→ AccessibilityService
→ WeatherService
→ ChargerService
→ FestivalRiskService
→ 종합 상태와 체크리스트
```

독립 조회는 `Promise.allSettled`로 병렬 실행한다.
API 하나가 실패해도 가능한 결과는 유지한다.

## Data Sources

- Tourism: `/searchKeyword2`, `/detailWithTour2`
- Weather: 기상청 단기예보
- Charger: 전국 전동휠체어 급속충전기 표준데이터
- Festival: 전국축제정보 표준데이터

충전소 실시간 작동 여부는 확인 불가로 처리한다.
축제 결과는 실시간 혼잡도가 아니라 행사 기반 위험이다.

## Data States

편의시설:

```text
CONFIRMED
NOT_AVAILABLE
NOT_PROVIDED
CONFLICTING
```

조회 상태:

```text
SUCCESS
NO_DATA
OUT_OF_RANGE
FAILED
NOT_APPLICABLE
```

빈 값은 기본적으로 `NOT_PROVIDED`다.
`NO_DATA`와 `FAILED`를 구분한다.
예보 범위 밖은 `OUT_OF_RANGE`다.

## Shared Contracts

다음은 공동 계약 파일이다.

```text
src/domain/*.ts
src/application/ports/*.ts
src/mcp/tools/*.tool.ts의 Schema
```

계약 변경 시 관련 Service, Adapter, Tool, fixture, 테스트를 함께 수정한다.
작업 목적과 무관한 계약 리팩터링은 하지 않는다.

## Tests

- Unit: 정책, 거리, 날짜, 격자 변환
- Integration: Adapter와 Mapper, fixture 기반
- Contract: Tool Schema
- E2E: MCP Tool 전체 흐름

기본 테스트에서 실제 공공 API를 호출하지 않는다.

## Agent Workflow

작업 전:
1. `README.md`, `AGENTS.md`, `SKILL.md`, `RULES.md` 확인
2. 관련 Domain과 Port 확인
3. 기존 타입 재사용 여부 확인
4. 변경 범위 최소화

작업 후:
1. 타입 검사
2. 관련 테스트
3. 린트
4. 빌드
5. 변경 내용과 남은 위험 요약

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Do Not

- DB, ORM, Redis 추가
- 요청 간 상태 저장
- API Key 하드코딩
- stdout 로그 출력
- 원본 API 응답 그대로 반환
- 예보 범위 밖 날씨 추정
- 충전소 실시간 상태 단정
- 축제 데이터로 실시간 혼잡도 단정
- 요청받지 않은 대규모 리팩터링
