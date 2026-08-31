export interface WheelchairChargerDto {
  response: WheelchairChargerResponseDto
}

export interface WheelchairChargerResponseDto {
  header: WheelchairChargerHeaderDto
  body: WheelchairChargerBodyDto
}

export interface WheelchairChargerHeaderDto {
  resultCode: string
  resultMsg: string
  type: string
}

export interface WheelchairChargerBodyDto {
  items: WheelchairChargerItemDto[]
  totalCount: string
  numOfRows: string
  pageNo: string
}

export type WheelchairChargerItemDto = Readonly<Record<string, unknown>>
