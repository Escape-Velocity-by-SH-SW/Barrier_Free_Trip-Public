# 07. 로컬 `.env`와 운영 환경변수

먼저 기억할 내용은 세 가지다.

1. 로컬에서는 Node.js가 `.env` 파일을 읽어 `process.env`에 넣는다.
2. 운영에서는 배포 환경이 값을 직접 `process.env`에 넣는다.
3. 애플리케이션 코드는 두 환경을 구분하지 않으며 API key를 코드나 Docker image에 저장하지 않는다.

## 1) 기존 문제

운영 환경은 이미 container 밖에서 환경변수를 넣고 `createContainer(process.env)`가 읽는 구조였다.
다만 로컬 개발자가 `.env`를 편리하게 전달할 실행 명령이 없었다. 코드에 `dotenv.config()`를 넣으면
운영 애플리케이션도 `.env` 파일이 있다고 가정할 수 있어 기존 배포 방식과 맞지 않을 수 있었다.

## 2) 적용한 해결 방법

Node 24가 `--env-file`을 지원하므로 새 라이브러리 없이 `package.json`에 다음 실행 명령만
추가했다.

```json
"start:local": "node --env-file=.env dist/http-main.js"
```

Dockerfile과 운영용 `start:http`는 변경하지 않았다. `.gitignore`와 `.dockerignore`에는 이미
`.env`, `.env.*`가 있어 그대로 유지했다. README에 로컬과 Docker 로컬 실행 명령을 추가했다.

## 3) 핵심 개념

환경변수는 프로그램이 시작될 때 외부에서 받는 이름과 값의 설정이다. Node.js에서는
`process.env`로 읽는다. `.env`는 개발자가 이 값을 로컬 파일에 편하게 적는 방법일 뿐, 애플리케이션
자체의 설정 방식은 여전히 `process.env` 하나다.

```text
LOCAL
.env
↓ node --env-file=.env
process.env
↓
createContainer

PRODUCTION
PlayMCP/container env injection
↓
process.env
↓
createContainer
```

Dockerfile의 `ENV NODE_ENV=production`, `ENV PORT=3000`은 민감하지 않은 기본값이다. API key는
Dockerfile이나 코드에 쓰지 않고 실행 환경이 넣는다. `docker run --env-file .env`도 `.env` 파일을
Docker image에 복사하지 않고 실행 중인 container의 환경변수로 전달한다.

## 4) 실제 코드 흐름

```text
npm run start:local
↓ Node가 .env parse
node dist/http-main.js
↓
http-main.ts main()
↓
createContainer() 기본 인자 process.env
↓
getRequiredEnv/getOptionalEnv
↓
API client config 생성
```

운영에서는 Docker `CMD ["npm", "run", "start:http"]`가 `node dist/http-main.js`를 실행한다.
환경 파일을 읽는 코드가 없으므로 배포 환경이 넣은 `process.env`만 사용한다.

## 5) 왜 이 방법을 선택했는가

코드에서 `dotenv`를 불러오는 방식과 달리, Node.js 시작 옵션을 쓰면 로컬 실행 명령만 달라지고
빌드된 애플리케이션 코드는 같다. Bootstrap과 application은 실행 환경의 차이를 알 필요가 없고 새
라이브러리도 필요 없다. Node.js 버전이 24로 정해져 있어 `--env-file` 지원 여부도 분명하다.

## 6) 장점과 한계

- `npm run start:local` 전에 build가 필요하다.
- `.env`가 없으면 local start가 실패할 수 있다.
- `.env` 값을 팀에 안전하게 공유하거나 비밀값을 관리하는 기능까지 제공하지는 않는다.
- `docker run --env-file`은 개발 편의 기능이며 운영에 `.env` 파일이 필요하다는 뜻은 아니다.
- 이번 실행 환경에는 Docker CLI가 없어 실제 image build/run은 검증하지 못했다.

## 7) 실패 상황

- 필수 key 누락: `createContainer()`가 시작할 때 명확한 오류 발생
- 잘못된 festival page size: positive integer validation 실패
- `.env`가 Git에 들어갈 위험: `.gitignore`로 차단
- `.env`가 Docker image에 들어갈 위험: `.dockerignore`로 차단
- Container restart: platform이 같은 env를 다시 주입해야 하며 cache와 달리 secret을 process가
  자체 보존하지 않음

## 8) 테스트

`create-container.test.ts`는 `process.env`와 같은 객체로 container가 구성되는지와 필수 key가 없을
때 시작에 실패하는지 검증한다. Node.js는 실제 `v24.18.0`으로 확인했다. 타입 검사와 빌드는 로컬과
운영이 같은 코드를 사용하는지 확인한다. Docker 명령은 CLI 부재로 실행하지
못했고 README에 재현 명령을 남겼다.

## 9) 내가 반드시 이해해야 할 코드

- 파일: `package.json`
  - script: `start:http`, `start:local`
  - 왜 중요한지: production과 local의 차이가 Node 시작 옵션뿐임을 보여준다.
- 파일: `src/bootstrap/create-container.ts`
  - 함수: `createContainer`, `getRequiredEnv`
  - 왜 중요한지: application 설정 진입점이 오직 `process.env`임을 보여준다.
- 파일: `Dockerfile`
  - 항목: runtime stage와 `CMD`
  - 왜 중요한지: `.env`나 API key를 COPY하지 않고 production command를 유지한다.

## 10) 면접/설명용 정리

로컬에서는 Node 24의 `--env-file`이 `.env` 값을 `process.env`에 넣고, 운영에서는
PlayMCP/container가 같은 `process.env`를 넣습니다. 애플리케이션 코드는 두 환경의 차이를 모르며
`dotenv`도 사용하지 않습니다. API key는 코드나 Docker image에 들어가지 않고, `.gitignore`와
`.dockerignore`가 로컬 파일의 실수로 인한 포함을 막습니다. 개발 편의만 추가하고 운영 배포 방식은
바꾸지 않았습니다.
