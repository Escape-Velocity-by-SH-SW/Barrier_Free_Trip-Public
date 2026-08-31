export type StandardApiCountDto = string | number | null;

export interface StandardApiResponseDto<TData> {
  currentCount?: StandardApiCountDto;
  data?: TData[] | null;
  matchCount?: StandardApiCountDto;
  page?: StandardApiCountDto;
  perPage?: StandardApiCountDto;
  totalCount?: StandardApiCountDto;
  response?: {
    header?: {
      resultCode?: string | number | null;
      resultMsg?: string | null;
      type?: string | null;
    };
    body?: {
      items?: TData[] | { item?: TData | TData[] | null } | null;
      totalCount?: StandardApiCountDto;
      numOfRows?: StandardApiCountDto;
      pageNo?: StandardApiCountDto;
    };
  };
}

export interface FestivalRowDto {
  축제명?: string | null;
  개최장소?: string | null;
  축제시작일자?: string | null;
  축제종료일자?: string | null;
  축제내용?: string | null;
  주관기관명?: string | null;
  주최기관명?: string | null;
  전화번호?: string | null;
  홈페이지주소?: string | null;
  관련정보?: string | null;
  소재지도로명주소?: string | null;
  소재지지번주소?: string | null;
  위도?: string | null;
  경도?: string | null;
  데이터기준일자?: string | null;
  fstvlNm?: string | null;
  opar?: string | null;
  fstvlStartDate?: string | null;
  fstvlEndDate?: string | null;
  fstvlCo?: string | null;
  mnnstNm?: string | null;
  auspcInsttNm?: string | null;
  suprtInsttNm?: string | null;
  phoneNumber?: string | null;
  homepageUrl?: string | null;
  relateInfo?: string | null;
  rdnmadr?: string | null;
  lnmadr?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  referenceDate?: string | null;
  insttCode?: string | null;
  insttNm?: string | null;
}

export type FestivalResponseDto = StandardApiResponseDto<FestivalRowDto>;
