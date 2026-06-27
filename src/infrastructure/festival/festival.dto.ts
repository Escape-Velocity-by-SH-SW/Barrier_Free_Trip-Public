export type StandardApiCountDto = string | number | null;

export interface StandardApiResponseDto<TData> {
  currentCount?: StandardApiCountDto;
  data?: TData[] | null;
  matchCount?: StandardApiCountDto;
  page?: StandardApiCountDto;
  perPage?: StandardApiCountDto;
  totalCount?: StandardApiCountDto;
}

export interface FestivalRowDto {
  "축제명"?: string | null;
  "개최장소"?: string | null;
  "축제시작일자"?: string | null;
  "축제종료일자"?: string | null;
  "축제내용"?: string | null;
  "주관기관명"?: string | null;
  "주최기관명"?: string | null;
  "전화번호"?: string | null;
  "홈페이지주소"?: string | null;
  "관련정보"?: string | null;
  "소재지도로명주소"?: string | null;
  "소재지지번주소"?: string | null;
  "위도"?: string | null;
  "경도"?: string | null;
  "데이터기준일자"?: string | null;
}

export type FestivalResponseDto = StandardApiResponseDto<FestivalRowDto>;
