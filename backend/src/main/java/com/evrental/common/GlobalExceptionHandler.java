package com.evrental.common;

import java.util.Comparator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Every failure leaves through here, so the UI only ever has one error shape to
 * handle. Nothing else in the codebase should build an error body by hand.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ApiErrorResponse> unauthorized(UnauthorizedException ex) {
        return body(HttpStatus.UNAUTHORIZED, ex.getMessage(), null);
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiErrorResponse> notFound(NotFoundException ex) {
        return body(HttpStatus.NOT_FOUND, ex.getMessage(), null);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiErrorResponse> conflict(ConflictException ex) {
        return body(HttpStatus.CONFLICT, ex.getMessage(), ex.field());
    }

    /**
     * The unique indexes, when a pre-insert check lost a race with another
     * request. Rare, and correct -- the index is the real guarantee and the
     * check is only there to name the field -- but the caller must still get a
     * 409 rather than the catch-all's 500.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiErrorResponse> dataIntegrity(DataIntegrityViolationException ex) {
        log.warn("Constraint violation surfaced to the caller", ex);
        return body(HttpStatus.CONFLICT, "That value is already in use", null);
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ApiErrorResponse> validation(ValidationException ex) {
        return body(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage(), ex.field());
    }

    /**
     * Bean validation on a @RequestBody. The first failing field wins — the
     * form shows one message per input. Violation order is not guaranteed by
     * the validator, so sort by field name: the response is deterministic and
     * the same field is reported no matter which JVM or validator version runs.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> beanValidation(MethodArgumentNotValidException ex) {
        FieldError first = ex.getBindingResult().getFieldErrors().stream()
                .min(Comparator.comparing(FieldError::getField))
                .orElse(null);
        String field = first == null ? null : first.getField();
        String message = first == null ? "Invalid request" : first.getDefaultMessage();
        return body(HttpStatus.UNPROCESSABLE_ENTITY, message, field);
    }

    /**
     * A URL nobody handles. Spring Boot 3.2+ raises this rather than returning
     * 404 itself, so without this method the catch-all below turns every typo
     * in a URL into a 500 — which reads as "the server is broken" when the
     * truth is "no such endpoint", and hides real routing mistakes.
     */
    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    public ResponseEntity<ApiErrorResponse> noHandler(Exception ex) {
        return body(HttpStatus.NOT_FOUND, "No such endpoint", null);
    }

    /** Right URL, wrong verb — a GET where the endpoint only takes POST. */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiErrorResponse> wrongMethod(HttpRequestMethodNotSupportedException ex) {
        return body(HttpStatus.METHOD_NOT_ALLOWED, "That endpoint does not accept " + ex.getMethod(), null);
    }

    /** Malformed or missing JSON body. A client bug, not a server one. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> unreadableBody(HttpMessageNotReadableException ex) {
        return body(HttpStatus.BAD_REQUEST, "Request body is missing or malformed", null);
    }

    /**
     * A denial from {@code @PreAuthorize}. Method security throws this inside
     * the controller, so it never reaches the {@code accessDeniedHandler} in
     * SecurityConfig — without this method the catch-all below would turn every
     * "you may not do that" into a 500 and log a stack trace for it. The two
     * have to stay in step: same status, same wording.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiErrorResponse> accessDenied(AccessDeniedException ex) {
        return body(HttpStatus.FORBIDDEN, "You do not have access to this", null);
    }

    /**
     * The catch-all. The real message and stack go to the log with the request
     * id; the caller gets a generic line, because an exception message can
     * carry a table name, a SQL fragment or another tenant's identifier.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> unexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong. Please try again.", null);
    }

    private ResponseEntity<ApiErrorResponse> body(HttpStatus status, String message, String field) {
        return ResponseEntity.status(status).body(new ApiErrorResponse(message, status.value(), field));
    }
}
