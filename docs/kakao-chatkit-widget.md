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
Basic
├─ Summary Card
│  ├─ 장소·방문 정보
│  ├─ 종합 판단
│  ├─ 이동·편의시설·날씨·주변 혼잡·충전 요약
│  └─ 준비사항 최대 3개
└─ Detail Card
   ├─ collapsed: true
   ├─ 이동과 편의시설
   ├─ 날씨
   ├─ 주변 행사 · 혼잡
   └─ 충전
```

Summary와 Detail Builder가 분리되어 있어 Kakao Preview에서 `collapsed`가 기대대로 동작하지 않으면
상세 Card의 `collapsed`만 제거해 짧은 상세 정보를 항상 표시하는 구조로 바꿀 수 있다.

## collapsed에 대해 확인된 사실

현재 ChatKit.js 타입에서 `BasicRoot`는 Component와 다른 WidgetRoot를 자식으로 가질 수 있고,
`Card`에는 선택적인 `collapsed?: boolean` 속성이 있다.

- [ChatKit.js BasicRoot](https://openai.github.io/chatkit-js/api/openai/chatkit/namespaces/widgets/type-aliases/basicroot/)
- [ChatKit.js Card](https://openai.github.io/chatkit-js/api/openai/chatkit/namespaces/widgets/type-aliases/card/)

그러나 타입 문서에는 `collapsed: true`가 사용자의 클릭으로 펼쳐지고 다시 접히는 Accordion이라고
명시되어 있지 않다. 따라서 코드에서는 초기 접힘 실험값으로만 사용하며, 실제 토글 동작은 Kakao
Tools Preview에서 확인해야 한다.

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
5. `상세 정보 보기`가 처음에 접혀 있는지 확인한다.
6. 제목 또는 Card를 눌렀을 때 상세 내용이 펼쳐지고 다시 접히는지 확인한다.
7. 공유 동작에서 `copy_text` Markdown이 정상적으로 사용되는지 확인한다.
8. Widget 렌더링이 실패할 때 기존 Text 결과가 보이는지 확인한다.

`collapsed`가 단순히 내용을 숨기고 클릭할 수 없다면 상세 Card에서 `collapsed: true`를 제거한 뒤
요약 아래에 짧은 상세 내용을 항상 표시하는 방식으로 전환한다.
