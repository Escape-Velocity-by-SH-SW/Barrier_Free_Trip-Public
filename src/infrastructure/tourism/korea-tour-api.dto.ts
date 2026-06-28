export type TourApiScalarDto = string | number | null;

export type TourApiItemDto<TItem> = TItem | TItem[];

export interface TourApiHeaderDto {
  resultCode?: string | null;
  resultMsg?: string | null;
}

export interface TourApiItemsDto<TItem> {
  item?: TourApiItemDto<TItem> | null;
}

export interface TourApiBodyDto<TItem> {
  items?: TourApiItemsDto<TItem> | "" | null;
  numOfRows?: TourApiScalarDto;
  pageNo?: TourApiScalarDto;
  totalCount?: TourApiScalarDto;
}

export interface TourApiResponseDto<TItem> {
  response?: {
    header?: TourApiHeaderDto;
    body?: TourApiBodyDto<TItem>;
  };
}

export interface SearchKeywordItemDto {
  contentid?: string | null;
  contenttypeid?: string | null;
  title?: string | null;
  addr1?: string | null;
  addr2?: string | null;
  mapx?: string | null;
  mapy?: string | null;
  firstimage?: string | null;
  firstimage2?: string | null;
  tel?: string | null;
  zipcode?: string | null;
}

export type SearchKeywordResponseDto = TourApiResponseDto<SearchKeywordItemDto>;

export interface DetailWithTourItemDto {
  contentid?: string | null;
  parking?: string | null;
  route?: string | null;
  publictransport?: string | null;
  ticketoffice?: string | null;
  promotion?: string | null;
  wheelchair?: string | null;
  exit?: string | null;
  elevator?: string | null;
  restroom?: string | null;
  auditorium?: string | null;
  room?: string | null;
  handicapetc?: string | null;
  braileblock?: string | null;
  helpdog?: string | null;
  guidehuman?: string | null;
  audioguide?: string | null;
  bigprint?: string | null;
  brailepromotion?: string | null;
  guidesystem?: string | null;
  blindhandicapetc?: string | null;
  signguide?: string | null;
  videoguide?: string | null;
  hearingroom?: string | null;
  hearinghandicapetc?: string | null;
  stroller?: string | null;
  lactationroom?: string | null;
  babysparechair?: string | null;
  infantsfamilyetc?: string | null;
}

export type DetailWithTourResponseDto = TourApiResponseDto<DetailWithTourItemDto>;
