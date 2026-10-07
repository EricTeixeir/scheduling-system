export { APPOINTMENT_STATUSES, type AppointmentStatus } from './appointment-status';
export { ROLES, type Role } from './roles';
export { isNonEmptyString } from './strings';

export { idParamsSchema, type IdParamsInput, type IdParamsOutput } from './common/id-params';
export { isoDateTimeSchema } from './common/iso-date-time';
export { localDateSchema } from './common/local-date';
export { paginatedSchema, type Paginated } from './common/paginated';
export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationQuerySchema,
  type PaginationQueryInput,
  type PaginationQueryOutput,
} from './common/pagination';
export { timeOfDaySchema } from './common/time-of-day';
export { uuidSchema } from './common/uuid';

export {
  EMAIL_MAX_LENGTH,
  emailSchema,
  NAME_MAX_LENGTH,
  nameSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
} from './auth/fields';
export { loginSchema, type LoginInput, type LoginOutput } from './auth/login';
export { registerSchema, type RegisterInput, type RegisterOutput } from './auth/register';
export { userSchema, type User } from './auth/user';

export {
  availabilityQuerySchema,
  type AvailabilityQueryInput,
  type AvailabilityQueryOutput,
} from './availability/availability-query';
export {
  availabilityResponseSchema,
  slotSchema,
  type AvailabilityResponse,
  type Slot,
} from './availability/availability-response';

export {
  adminAppointmentSchema,
  appointmentSchema,
  type AdminAppointment,
  type Appointment,
} from './appointments/appointment';
export {
  adminAppointmentsQuerySchema,
  APPOINTMENT_SCOPES,
  clientAppointmentsQuerySchema,
  SEARCH_MAX_LENGTH,
  type AdminAppointmentsQueryInput,
  type AdminAppointmentsQueryOutput,
  type AppointmentScope,
  type ClientAppointmentsQueryInput,
  type ClientAppointmentsQueryOutput,
} from './appointments/appointments-query';
export {
  APPOINTMENT_HISTORY_ACTIONS,
  appointmentHistoryEntrySchema,
  appointmentHistorySchema,
  type AppointmentHistory,
  type AppointmentHistoryAction,
  type AppointmentHistoryEntry,
} from './appointments/appointment-history';
export {
  createAppointmentSchema,
  MAX_APPOINTMENT_MINUTES,
  NOTES_MAX_LENGTH,
  type CreateAppointmentInput,
  type CreateAppointmentOutput,
} from './appointments/create-appointment';
export {
  appointmentStatusTargetSchema,
  updateAppointmentStatusSchema,
  type AppointmentStatusTarget,
  type UpdateAppointmentStatusInput,
  type UpdateAppointmentStatusOutput,
} from './appointments/update-appointment-status';

export {
  BLOCK_REASON_MAX_LENGTH,
  createScheduleBlockSchema,
  type CreateScheduleBlockInput,
  type CreateScheduleBlockOutput,
} from './blocks/create-schedule-block';
export {
  scheduleBlockListSchema,
  scheduleBlockSchema,
  type ScheduleBlock,
  type ScheduleBlockList,
} from './blocks/schedule-block';

export { ERROR_CODES, type ErrorCode } from './errors/error-codes';
export {
  MAX_LISTED_CONFLICTS,
  problemDetailsSchema,
  scheduleConflictSchema,
  type FieldError,
  type ProblemDetails,
  type ScheduleConflict,
} from './errors/problem-details';

export {
  adminCreateAppointmentSchema,
  type AdminCreateAppointmentInput,
  type AdminCreateAppointmentOutput,
} from './admin/admin-booking';
export { adminSummarySchema, type AdminSummary } from './admin/admin-summary';
export {
  CLIENT_SEARCH_LIMIT,
  clientSearchQuerySchema,
  clientSearchResponseSchema,
  clientSummarySchema,
  type ClientSearchQueryInput,
  type ClientSearchResponse,
  type ClientSummary,
} from './admin/clients';
