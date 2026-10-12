export interface ConsultationAppointment {
  _id: string;
  patientId?: {
    _id: string;
    name: string;
    uhid?: string;
    age?: number;
    gender?: string;
  };
  doctorId?: {
    _id: string;
    userId?: { _id?: string; name?: string };
    name?: string;
  };
  tokenNumber?: string;
  status: string;
  queueStatus?: string;
  priority?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  reason: string;
  checkedInAt?: string;
  calledAt?: string;
  consultationStartedAt?: string;
  createdAt?: string;
}
