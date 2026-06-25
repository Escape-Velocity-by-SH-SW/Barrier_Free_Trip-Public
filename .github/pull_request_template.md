# PR 제목

<!-- 예: feat: add destination weather tool -->

## 작업 개요

<!-- 이번 PR에서 무엇을 구현하거나 수정했는지 간단히 작성해주세요. -->

*
*
*

## 관련 이슈

<!-- 연결된 이슈가 있다면 작성해주세요. -->

* Closes #
* Related to #

## 영향받는 MCP Tool

<!-- 변경으로 영향을 받는 Tool에 x를 표시해주세요. -->

* [ ] `get_destination_weather`
* [ ] `find_nearby_wheelchair_chargers`
* [ ] `get_destination_accessibility`
* [ ] `get_destination_event_risk`
* [ ] `assess_accessible_visit`
* [ ] 영향 없음

## 주요 변경 사항

### 1. 구현 내용

<!-- 핵심 구현 내용을 작성해주세요. -->

*

## 외부 API 변경 사항

<!-- 이번 PR에서 사용하거나 수정한 외부 API를 체크해주세요. -->

* [ ] 한국관광공사 `/searchKeyword2`
* [ ] 한국관광공사 `/detailWithTour2`
* [ ] 기상청 단기예보
* [ ] 전국 전동휠체어 급속충전기 표준데이터
* [ ] 전국축제정보 표준데이터
* [ ] 해당 없음

### 요청 또는 응답 변경

<!-- 요청 파라미터, DTO, Mapper 변경이 있다면 작성해주세요. -->

*

## 스키마 및 공통 계약 변경

<!-- Tool Schema, Domain Model, Repository Port 변경 여부를 작성해주세요. -->

* [ ] `inputSchema` 변경
* [ ] `outputSchema` 변경
* [ ] Domain Model 변경
* [ ] Repository Port 변경
* [ ] 공통 상태값 변경
* [ ] 변경 없음

변경 내용:

*

영향 범위:

*

## MCP Inspector 확인

<!-- Tool 변경이 있는 경우 작성해주세요. -->

* [ ] Tool이 정상적으로 노출됩니다.
* [ ] Tool description이 의도와 일치합니다.
* [ ] 입력 Schema가 정상 표시됩니다.
* [ ] `structuredContent`가 outputSchema와 일치합니다.
* [ ] 잘못된 입력이 검증됩니다.
* [ ] 해당 없음

테스트 입력:

```json
{}
```

결과 요약:

```text
```

## 보안 및 설정 확인

* [ ] API Key를 코드에 직접 작성하지 않았습니다.
* [ ] `.env` 파일을 커밋하지 않았습니다.
* [ ] 로그에 인증키 또는 전체 요청 URL을 출력하지 않습니다.
* [ ] stdio 환경에서 `console.log()`를 사용하지 않았습니다.
* [ ] 불필요한 DB, ORM, Redis 의존성을 추가하지 않았습니다.


## 스크린샷 또는 실행 결과

<!-- MCP Inspector, 테스트 결과 등 필요한 경우 첨부해주세요. -->

## 체크리스트

* [ ] 변경 사항이 하나의 명확한 목적을 가집니다.
* [ ] Tool Handler에 비즈니스 로직을 직접 작성하지 않았습니다.
* [ ] Application Service가 구체 Adapter에 직접 의존하지 않습니다.
* [ ] 외부 API DTO와 Domain Model을 분리했습니다.
* [ ] 새 로직에 필요한 테스트를 추가했습니다.
* [ ] 공통 Schema 변경 시 관련 Tool과 테스트를 함께 수정했습니다.
* [ ] README 또는 AGENTS.md 수정이 필요한지 확인했습니다.
* [ ] 코드 포맷과 린트 규칙을 준수했습니다.
* [ ] 관련 없는 파일을 함께 수정하지 않았습니다.

## 추가 메모

<!-- 리뷰어가 알아야 할 제한사항, 후속 작업, 미해결 이슈가 있다면 작성해주세요. -->

*
