import "package:dio/dio.dart";

sealed class AppException implements Exception {
  const AppException(this.message);
  final String message;

  @override
  String toString() => message;
}

class NetworkException extends AppException {
  const NetworkException([super.message = "Network error"]);
}

class TimeoutException extends AppException {
  const TimeoutException([super.message = "Request timed out"]);
}

class UnauthorizedException extends AppException {
  const UnauthorizedException([super.message = "Session expired"]);
}

class ForbiddenException extends AppException {
  const ForbiddenException([super.message = "Access denied"]);
}

class NotFoundException extends AppException {
  const NotFoundException([super.message = "Not found"]);
}

class ConflictException extends AppException {
  const ConflictException([super.message = "Conflict"]);
}

class ValidationException extends AppException {
  const ValidationException(super.message);
}

class ServerException extends AppException {
  const ServerException([super.message = "Server error"]);
}

AppException mapDioError(Object error) {
  if (error is! DioException) return ServerException(error.toString());
  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
      return const TimeoutException();
    case DioExceptionType.connectionError:
      return const NetworkException();
    case DioExceptionType.cancel:
      return const NetworkException("Cancelled");
    case DioExceptionType.badResponse:
      final status = error.response?.statusCode ?? 0;
      final detail = _detail(error.response?.data) ?? "Request failed";
      return switch (status) {
        400 => ValidationException(detail),
        401 => UnauthorizedException(detail),
        403 => ForbiddenException(detail),
        404 => NotFoundException(detail),
        409 => ConflictException(detail),
        _ => ServerException(detail),
      };
    default:
      return ServerException(error.message ?? "Unknown error");
  }
}

String? _detail(dynamic data) {
  if (data is Map && data["detail"] != null) return data["detail"].toString();
  return null;
}
