# SKILL.md

## Purpose

이 문서는 기능 구현 순서를 정의한다.

## Common Workflow

```text
Domain 확인
→ Repository Port 확인
→ DTO
→ Client
→ Mapper
→ Adapter
→ Application Service
→ MCP Tool
→ Test
```

계약 변경이 필요하지 않다면 Domain과 Port를 먼저 수정하지 않는다.

테스트 코드를 위한 `.Test` 파일을 생성하지 않는다.

## Destination Resolution

관련 파일:

```text
domain/destination.ts
application/ports/tourism-accessibility.repository.ts
application/services/destination-resolver.ts
infrastructure/tourism/*
```

순서:

1. `/searchKeyword2` DTO 정의
2. Client 구현
3. Mapper로 `DestinationCandidate` 변환
4. Adapter의 `searchDestination` 구현
5. Resolver에서 정확 일치·없음·복수 후보 판정
6. fixture 테스트

완료 조건:

- `contentId`, `contentTypeId`, 주소, 좌표 반환
- NOT_FOUND와 AMBIGUOUS 구분

## Accessibility

Tool: `get_destination_accessibility`

순서:

1. Destination 조회
2. `/detailWithTour2` Client와 DTO
3. Mapper에서 빈 값 정규화
4. Adapter의 `getAccessibility`
5. Service에서 이동 조건별 유의사항 생성
6. Tool 연결
7. 테스트

주의:

- 빈 값은 `NOT_PROVIDED`
- 명시적 부재만 `NOT_AVAILABLE`

## Weather

Tool: `get_destination_weather`

순서:

1. Destination 좌표 조회
2. 위·경도 → 기상청 격자
3. Asia/Seoul 기준 단기예보 발표 기준일·시간 계산
4. 단기예보 호출
5. `POP`, `PCP`, `PTY`, `TMN`, `TMX`와 방문일 기준 item 필터링
6. 방문일 일별 예보로 집계
7. Service에서 강수/폭염/한파 중심 risk와 유의사항 생성
8. Tool 연결
9. 테스트

주의:

- Asia/Seoul 기준
- 단기예보 `base_time`은 `0200`, `0500`, `0800`, `1100`, `1400`, `1700`, `2000`, `2300` 중 발표 10분이 지난 최신 값
- 과거 방문일 또는 API 응답에 방문일이 없으면 `NO_DATA`
- 임의 예측 금지
- Resolver 연동 전에는 MCP Inspector 검증을 위해 Destination 값을 수동 입력받을 수 있다.

## Charger

Tool: `find_nearby_wheelchair_chargers`

순서:

1. Destination 주소와 좌표 확인
2. 주소에서 시도명·시군구명 추출
3. 충전소 API 호출
4. 좌표 정규화
5. Haversine 거리 계산
6. 거리순 정렬 후 상위 결과 선택
7. Service 유의사항 생성
8. Tool 연결
9. 테스트

주의:

- 실시간 상태는 `UNKNOWN`
- 좌표 없는 데이터 처리
- 없음과 실패 구분
- Resolver 연동 전에는 MCP Inspector 검증을 위해 Destination 값을 수동 입력받을 수 있다.

## Festival Risk

Tool: `get_destination_event_risk`

순서:

1. Destination 좌표와 방문일 확인
2. 축제 API 호출
3. 기간과 좌표 정규화
4. 방문일과 기간 중첩 검사
5. 거리 계산
6. 위험 단계 산출
7. Tool 연결
8. 테스트

MVP 기준:

```text
1km 이내 진행 축제: HIGH
1km 초과 5km 이내: MEDIUM
진행 축제 없음: LOW
기간 또는 좌표 부족: UNKNOWN
```

LOW는 실제로 한산하다는 뜻이 아니다.

## Aggregate Assessment

Tool: `assess_accessible_visit`

순서:

1. DestinationResolver 1회 호출
2. 확정된 Destination을 개별 Service에 전달
3. `Promise.allSettled` 병렬 실행
4. 실패 결과를 개별 `FAILED`로 변환
5. 중복 유의사항 제거
6. 교차 유의사항 생성
7. 종합 상태와 체크리스트 생성
8. `structuredContent` 반환
9. E2E 테스트

Tool끼리 호출하지 않는다.

종합 상태:

```text
LIKELY_ACCESSIBLE
ACCESSIBLE_WITH_CAUTION
CHECK_REQUIRED
INSUFFICIENT_DATA
```

## Tool Checklist

- 사용자 의도 중심 description
- Zod input/output Schema
- 얇은 Handler
- `structuredContent`
- read-only annotation
- 오류 상태 처리
- Contract Test

## Adapter Checklist

- Repository Port 구현
- Client를 통한 외부 요청
- DTO와 Domain 분리
- Mapper 사용
- timeout
- 인증키 비노출
- fixture 테스트

## Completion Report

```text
변경 파일:
- ...

구현 내용:
- ...

검증:
- ...

남은 위험:
- ...
```
