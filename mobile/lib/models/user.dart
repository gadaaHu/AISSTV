import "package:freezed_annotation/freezed_annotation.dart";

part "user.freezed.dart";
part "user.g.dart";

@freezed
class AppUser with _$AppUser {
  const AppUser._();

  const factory AppUser({
    required String username,
    String? fullName,
    required String role,
    required bool active,
  }) = _AppUser;

  factory AppUser.fromJson(Map<String, dynamic> json) => _$AppUserFromJson(json);

  bool get isAdmin => role == "admin";
  bool get isManager => role == "manager" || isAdmin;
}
