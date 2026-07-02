/** KMA 단기예보 API의 최상위 JSON 응답 envelope다. */
export interface KmaForecastResponseDto {
  response: KmaResponseDto;
}

/** KMA 응답의 header와 선택적 body를 담는 공통 response 객체다. */
export interface KmaResponseDto {
  header: KmaResponseHeaderDto;
  body?: KmaForecastBodyDto;
}

/** KMA API 처리 결과 코드와 메시지를 담는 header 객체다. */
export interface KmaResponseHeaderDto {
  resultCode: string;
  resultMsg: string;
}

/** 단기예보 목록과 페이지 정보를 담는 body 객체다. */
export interface KmaForecastBodyDto {
  dataType: string; // 응답자료형식 (XML/JSON)
  items?: KmaForecastItemsDto;
  pageNo: number; // 페이지 번호
  numOfRows: number; // 한 페이지 결과 수
  totalCount: number;
}

/** KMA 예보 item 배열을 감싸는 items 객체다. */
export interface KmaForecastItemsDto {
  item?: KmaForecastItemDto[];
}

/** KMA category별 예보 값을 한 건씩 표현하는 원본 item DTO다. */
export interface KmaForecastItemDto {
  baseDate: string; // 발표일자
  baseTime: string; // 발표시각
  category: string; // 자료구분코드
  fcstDate: string; // 예보일자
  fcstTime: string; // 예보시각
  fcstValue: string | null; // 예보 값
  nx: number; // 예보지점 X 좌표
  ny: number; // 예보지점 Y 좌표
}
