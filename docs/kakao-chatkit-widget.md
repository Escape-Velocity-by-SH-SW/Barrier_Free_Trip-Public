# Kakao Tools ChatKit Widget 확인 가이드

`assess_accessible_visit`의 단일 관광지 성공 결과는 기존 Domain 결과를 유지하면서 Kakao Tools용
Widget을 함께 반환한다.

## 응답 구조

```text
structuredContent
→ 기존 종합 방문 평가 결과

content[0].text
→ JSON.stringify({ widget, copy_text })
```

`widget.status`는 넣지 않는다. `copy_text`에는 장소명, 방문일, 이동 조건, 종합 판단과 최대 3개의
준비사항만 담는다. 오류·장소 검색 실패 응답은 기존 Text 형식을 유지한다.

## Widget 구조

```text
Card
├─ 장소·방문 정보
├─ 종합 판단 Badge
├─ 한눈에 보기
│  ├─ Row: 이동 Col · 편의시설 Col
│  ├─ Row: 날씨 Col · 주변 혼잡 Col
│  └─ 충전 Col
└─ 준비사항 최대 3개
```

Kakao Tools Preview에서 우선 렌더링 호환성을 확인할 수 있도록 최상위 Widget Root는 개발 가이드
예시와 같은 단일 `Card`를 사용한다. 이번 단계에서는 상세 정보, `collapsed`, 토글을 모두 제외하고
요약 Widget만 반환한다.

## ChatKit 스펙 적용 사항

현재 OpenAI ChatKit 통합 문서에서 명시한 `Card`를 Widget Root로 사용한다. Card는 Kakao Tools
Preview에서 정상 렌더링이 확인된 `lg` 크기이며, 단순한 `Row + Col` 구조를 유지한다. 각 Col은
`flex: 1`과 `align: "stretch"`만 사용하며, 공통 Text에는 `maxLines` 제한을 두지 않는다. 종합 판단은
문구와 상태 색상을 함께 표시하는 `Badge`를 사용한다.

요약 문구는 2열에서 빠르게 읽을 수 있도록 짧게 표시한다. 편의시설의 미제공·충돌 정보는 성공으로
표현하지 않고 `확인 필요`로 안내한다. 날씨는 주요 위험과 대표 수치 하나, 축제는 행사 기반 혼잡
가능성과 행사 수, 충전은 충전소 수와 가장 가까운 거리를 보여준다. 충전소의 실시간 사용 가능 여부는
단정하지 않는다.

- [ChatKit WidgetRoot](https://developers.openai.com/api/docs/guides/chatkit-widgets#containers-widgetroot)
- [ChatKit WidgetNode](https://developers.openai.com/api/docs/guides/chatkit-widgets#components-widgetnode)

`collapsed`의 실제 토글 동작은 Kakao Tools에서 확인되지 않았으므로 이번 렌더링 검증 단계에서는
사용하지 않는다. 상세 정보도 Widget Envelope에 포함하지 않는다.

## Kakao Tools Preview 확인 순서

다음과 같이 단일 장소 종합 조회를 실행한다.

```json
{
  "destination": "경복궁",
  "visitDate": "2026-08-15",
  "travelerType": "POWER_WHEELCHAIR",
  "radiusKm": 3
}
```

확인할 내용:

1. 요약 Card가 모바일 폭에서 잘리지 않는지 확인한다.
2. 내부 Enum 대신 `🟠 주의해서 방문해요` 같은 문구가 표시되는지 확인한다.
3. 축제 위험이 `실시간 혼잡도`로 표현되지 않는지 확인한다.
4. 충전소를 현재 사용할 수 있다고 단정하지 않는지 확인한다.
5. 종합 판단 Badge의 문구와 색상이 함께 표시되는지 확인한다.
6. Widget에 상세 정보가 노출되지 않는지 확인한다.
7. 공유 동작에서 `copy_text` Markdown이 정상적으로 사용되는지 확인한다.
8. Widget 렌더링이 실패할 때 기존 Text 결과가 보이는지 확인한다.
