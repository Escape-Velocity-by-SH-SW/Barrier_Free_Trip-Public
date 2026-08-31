# RULES.md

## General

- TypeScript strict mode 유지
- `any` 금지
- 외부 입력과 API 응답을 신뢰하지 않음
- 한 함수와 클래스는 한 책임만 가짐
- 변경 범위 최소화
- 기존 공개 계약 우선 유지

## Naming

- 파일: `kebab-case.ts`
- 클래스·인터페이스·타입: `PascalCase`
- 함수·변수: `camelCase`
- MCP Tool: `snake_case`
- Boolean: `is`, `has`, `should`, `can` 접두어 사용

## Imports

- ESM 사용
- 상대 import에 `.js` 확장자
- 타입은 `import type`
- 순환 의존성 금지
- Application과 Domain에서 Infrastructure import 금지

## Types

- 외부 DTO와 Domain Model 분리
- 같은 상태 타입 중복 선언 금지
- optional과 nullable 혼용 금지
- 빈 문자열은 Mapper에서 `undefined`로 정규화
- 외부 API 응답은 `unknown`에서 검증 후 사용
- 날짜 변수는 의미가 드러나게 명명

## Functions

- 가능하면 30줄 이내
- 매개변수 3개 초과 시 객체 사용
- 중첩 조건보다 early return
- Promise 무시 금지
- 빈 `catch` 금지
- 오류를 잡으면 변환하거나 문맥을 추가

## MCP Tool

- Handler는 Application Service만 호출
- Handler에서 `fetch`, 거리·날짜 계산, DTO 매핑 금지
- description은 호출 의도를 설명
- input/output Zod Schema 필수
- `structuredContent` 반환
- 원본 API 응답 반환 금지
- 다른 Tool 호출 금지

## Application Service

- Repository Port에만 의존
- Adapter와 Client 직접 생성 금지
- 사용자 기능의 정책과 결과 조합 담당
- 병렬 가능한 외부 요청은 병렬 처리
- 종합 조회의 부분 실패는 `Promise.allSettled` 사용

## Client

담당:

- URL과 Query Parameter
- 인증키
- HTTP 요청
- timeout
- HTTP 상태 처리
- 원본 DTO 반환

담당하지 않음:

- 사용자 유의사항
- 위험 판단
- 종합 결과 조합

## Adapter

- Repository Port 구현
- Client 호출
- DTO 검증
- Mapper 호출
- 내부 타입 반환

## Mapper

- 순수 함수
- 네트워크와 환경변수 접근 금지
- 빈 문자열, 잘못된 숫자, 누락 좌표 처리
- 외부 필드명을 Domain에 전파하지 않음

## Errors

구분:

```text
INVALID_INPUT
DESTINATION_NOT_FOUND
AMBIGUOUS_DESTINATION
NO_DATA
OUT_OF_RANGE
EXTERNAL_API_FAILURE
```

- 오류 문자열 비교 금지
- API Key와 전체 URL 노출 금지
- 외부 내부 오류를 사용자에게 그대로 노출 금지
- `NO_DATA`와 `FAILED` 구분

## Date and Location

- 날짜 형식: `YYYY-MM-DD`
- 시간대: `Asia/Seoul`
- 위도: -90~90
- 경도: -180~180
- 거리 단위: km
- Haversine 공통 유틸 재사용
- API별 위도·경도 순서 확인

## Logging

stdio에서 stdout 로그 금지.

```typescript
console.error("[weather] request failed");
```

로그 금지 항목:

- API Key
- 인증 Query
- 전체 요청 URL
- 원본 응답 전체

## Security

- 인증키는 환경변수만 사용
- 런타임 환경변수는 컨테이너에서 주입
- 환경변수 파일 로딩 및 `dotenv` 사용 금지
- 환경변수 파일 커밋 금지
- 시작 시 환경변수 검증
- 입력을 URL 문자열에 직접 연결 금지
- `URL`, `URLSearchParams` 사용
- 모든 외부 요청에 timeout 적용

## Formatting

- 들여쓰기 2칸
- 세미콜론 사용
- 큰따옴표 사용
- trailing comma 사용
- 한 줄 최대 100자 권장
- Prettier 결과 유지

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

실행하지 못한 검증이나 실패를 숨기지 않는다.
