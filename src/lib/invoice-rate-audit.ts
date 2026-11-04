import type { Types } from "mongoose";

export interface ManualRateLine {
  name: string;
  price: number;
  manualRate?: boolean;
}

export function buildManualRateAuditRows(
  userId: Types.ObjectId | string,
  invoiceId: Types.ObjectId | string,
  items: ManualRateLine[],
  at: Date = new Date(),
) {
  return items.flatMap((item, lineIndex) => item.manualRate === true ? [{
    userId,
    invoiceId,
    lineIndex,
    lineName: item.name,
    rate: item.price,
    createdAt: at,
  }] : []);
}
