# Kakao Tools ChatKit Widget 확인 가이드

`assess_accessible_visit`는 `SUMMARY`와 `DETAIL` 두 응답 모드를 지원한다. 두 모드 모두 같은
`VisitAssessmentService.assess()` 결과를 사용하므로 장소, 접근성, 날씨, 충전소, 문화축제 cache와
부분 성공 동작을 그대로 재사용한다.

## 응답 모드

### SUMMARY

최초 종합 방문 평가에 사용한다. 단일 관광지 성공 결과는 다음 구조로 반환한다.

```text
structuredContent
→ 기존 종합 방문 평가 결과

content[0].text
→ JSON.stringify({ widget, copy_text })
```

의도된 Widget 구조는 단일 root `Card`, `size: "lg"`다. 수동 MCP Inspector와 Kakao Tools
Preview 검증은 아직 수행하지 않았다. `Card size="full"`, `Basic` root와 여러 Card의 composite,
detail-only `collapsed` 패턴은 현재 사용하지 않는다. Kakao가 출처 상태를 자동 표시하므로
`widget.status`도 직접 설정하지 않는다.

### DETAIL

직전 종합 방문 평가 전체에 대해 사용자가 “자세히 알려줘”, “좀 더 설명해줘”처럼 후속 설명을
요청했을 때 사용한다. `structuredContent`에는 기존 평가 결과를 유지하고 `content[0].text`에는
LLM이 대화 흐름에 맞춰 상세 답변을 만들기 쉬운 JSON context를 넣는다. Widget envelope는
반환하지 않는다.

후속 호출에서는 가능한 경우 이전 대화의 `destination`, `visitDate`, `travelerType`, `contentId`를
재사용한다. 접근성, 날씨, 문화축제, 전동휠체어 충전소 중 한 영역만 자세히 묻는 요청은 각각
`get_destination_accessibility`, `get_destination_weather`, `get_destination_event_risk`,
`find_nearby_wheelchair_chargers`를 우선 사용한다.

## SUMMARY Widget 구조

```text
Card(size="lg")
├─ 장소명 · 주소 · 방문일 · 이동 조건
├─ 종합 판단 Badge와 구체적인 판단 이유
├─ 이동 · 무장애 편의
├─ 방문일 날씨
├─ 주변 문화축제
├─ 전동휠체어 충전소 (POWER_WHEELCHAIR만)
└─ 출발 전에 확인해요 (2~4개)
```

- 시설명은 `장애인 화장실`, `장애인 주차장`처럼 무장애 의미를 보존한다.
- 시설의 `NOT_PROVIDED`는 “정보 미제공”으로 표시하며 시설 없음으로 바꾸지 않는다.
- 날씨는 최저·최고기온, 강수확률, 강수량, 강수형태, 위험 유형 중 실제 조회 값만 표시한다.
- 현재 SKY 정보를 수집하지 않으므로 맑음, 구름, 흐림을 생성하지 않는다.
- 제목은 “주변 문화축제”를 사용한다. 전국문화축제표준데이터에 등록된 문화축제 기준이며 모든
  지역 행사나 실시간 혼잡 정보가 아니다. 좌표 없는 축제는 거리 계산에서 제외될 수 있다.
- 전동휠체어 충전소는 최대 3곳의 실제 이름과 거리를 보여준다. 1km 미만 거리는 m로 표시한다.
  충전소 실시간 작동 상태와 현재 사용 가능 여부는 제공하지 않는다.

## DETAIL context 구조

DETAIL context에는 다음 의미가 분명한 필드를 제공한다.

- `destination`: 장소명과 주소
- `visit`: 방문일, 이동 조건, 반경
- `overall`: 종합 상태와 근거
- `accessibility`: 접근로, 출입구, 엘리베이터, 장애인 화장실·주차장, 휠체어·유모차 대여,
  수유실의 상태·상태 의미·원본 설명
- `weather`: 방문일 기온, 강수확률·강수량, 강수형태, 위험 유형, 유의사항
- `culturalFestivals`: 반경, 축제명·장소·기간·거리·주소와 데이터 범위 안내
- `wheelchairChargers`: 전동휠체어 이용 시 최대 3곳의 거리·주소·설치 위치·관리기관·전화번호와
  실시간 상태 미제공 안내
- `thingsToCheck`, `cautions`, `unknowns`, `phoneCheckQuestions`

context의 안내문은 LLM이 `NOT_PROVIDED`를 시설 없음으로 해석하거나, 문화축제 데이터를 모든
행사·실시간 혼잡으로 확대하거나, 충전소 위치를 실시간 작동 가능으로 단정하거나, 날씨 SKY를
추정하지 않도록 한다.

## Kakao Tools Preview 확인 순서

SUMMARY를 명시해 단일 장소 종합 조회를 실행한다.

```json
{
  "destination": "경복궁",
  "visitDate": "2026-08-22",
  "travelerType": "POWER_WHEELCHAIR",
  "radiusKm": 3,
  "responseMode": "SUMMARY"
}
```

확인할 내용:

1. root가 단일 `Card`, `size: "lg"`인지 확인한다.
2. `Basic`, `collapsed`, `widget.status`가 없는지 확인한다.
3. 주소, 실제 기온·강수확률과 시설의 완전한 이름이 표시되는지 확인한다.
4. 문화축제가 실시간 혼잡으로 표현되지 않고 데이터 범위 안내가 보이는지 확인한다.
5. 전동휠체어 충전소 최대 3곳의 이름·거리가 보이고 실시간 상태 미제공 안내가 있는지 확인한다.
6. “출발 전에 확인해요”가 중복 없이 2~4개인지 확인한다.
7. 공유 동작에서 `copy_text` Markdown이 정상적으로 사용되는지 확인한다.
8. `DETAIL` 호출은 Widget 없이 상세 context를 반환하는지 확인한다.
