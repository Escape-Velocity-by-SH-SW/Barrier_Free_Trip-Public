export interface KmaUltraSrtForecastResponseDto {
  response: KmaResponseDto;
}

export interface KmaResponseDto {
  header: KmaResponseHeaderDto;
  body?: KmaUltraSrtForecastBodyDto;
}

export interface KmaResponseHeaderDto {
  resultCode: string;
  resultMsg: string;
}

export interface KmaUltraSrtForecastBodyDto {
  dataType: string; // 응답자료형식 (XML/JSON)
  items?: KmaUltraSrtForecastItemsDto;
  pageNo: number; // 페이지 번호
  numOfRows: number; // 한 페이지 결과 수
  totalCount: number;
}

export interface KmaUltraSrtForecastItemsDto {
  item?: KmaUltraSrtForecastItemDto[];
}

export interface KmaUltraSrtForecastItemDto {
  baseDate: string; // 발표일자
  baseTime: string; // 발표시각
  category: string; // 자료구분코드
  fcstDate: string; // 예측일자
  fcstTime: string; // 예측시간
  fcstValue: string | null; // 예보 값
  nx: number; // 예보지점 X 좌표
  ny: number; // 예보지점 Y 좌표
}

export type KmaVilageForecastResponseDto = KmaUltraSrtForecastResponseDto;
export type KmaVilageForecastBodyDto = KmaUltraSrtForecastBodyDto;
export type KmaVilageForecastItemsDto = KmaUltraSrtForecastItemsDto;
export type KmaVilageForecastItemDto = KmaUltraSrtForecastItemDto;
