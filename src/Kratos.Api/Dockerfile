# Build:  podman build -f src/Kratos.Api/Dockerfile -t kratos-api .
# Run:    podman run -p 8080:8080 --env-file .env -e Seed__DemoPassword=... kratos-api
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props Kratos.slnx ./
COPY src/ src/
RUN dotnet publish src/Kratos.Api/Kratos.Api.csproj -c Release -o /app --no-self-contained

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
# Non-root user shipped with the .NET images.
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080 \
    ConnectionStrings__Kratos="Data Source=/tmp/kratos.db"
EXPOSE 8080
ENTRYPOINT ["dotnet", "Kratos.Api.dll"]
