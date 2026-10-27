export interface CreateServiceDto {
    name: string;
    category?: string;
    defaultRate: number;
    active?: boolean;
}

export interface UpdateServiceDto {
    name?: string;
    category?: string;
    defaultRate?: number;
    active?: boolean;
}
