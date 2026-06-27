export interface AppContainer {
  // 실제 Service 연결 시 필드를 추가한다.
  readonly services?: never;
}

export function createContainer(): AppContainer {
  return {};
}
