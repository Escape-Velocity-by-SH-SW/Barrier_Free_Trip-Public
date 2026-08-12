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
├─ 종합 판단
├─ 이동·편의시설·날씨·주변 혼잡·충전 요약
├─ 준비사항 최대 3개
└─ 상세 정보
   ├─ 이동과 편의시설
   ├─ 날씨
   ├─ 주변 행사 · 혼잡
   └─ 충전
```

Kakao Tools Preview에서 우선 렌더링 호환성을 확인할 수 있도록 최상위 Widget Root는 개발 가이드
예시와 같은 단일 `Card`를 사용한다. Summary와 Detail Builder는 계속 분리하되 최종 Card 안에서
두 영역의 children을 합친다.

## ChatKit 스펙 적용 사항

현재 OpenAI ChatKit 통합 문서에서 명시한 `Card`를 Widget Root로 사용한다. `Box.direction`은
문서에 명시된 `row | column` 중 `column`을 사용한다.

- [ChatKit WidgetRoot](https://developers.openai.com/api/docs/guides/chatkit-widgets#containers-widgetroot)
- [ChatKit WidgetNode](https://developers.openai.com/api/docs/guides/chatkit-widgets#components-widgetnode)

`collapsed`의 실제 토글 동작은 Kakao Tools에서 확인되지 않았으므로 이번 렌더링 검증 단계에서는
사용하지 않는다. 상세 정보는 요약 아래에 항상 표시한다.

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
5. 요약 아래의 상세 정보가 별도 조작 없이 표시되는지 확인한다.
6. 공유 동작에서 `copy_text` Markdown이 정상적으로 사용되는지 확인한다.
7. Widget 렌더링이 실패할 때 기존 Text 결과가 보이는지 확인한다.
