/**
 * An error a request can show the student as it is, with the HTTP status to answer with (404 not found, 409
 * already done, 422 cannot be done yet ...). Anything else is unexpected: it is logged and answered with a
 * general message. Areas name their own (SessionError, PlannerError) so a log says where one came from, and
 * every handler catches them all as ServiceError.
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
