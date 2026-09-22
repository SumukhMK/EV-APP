# Two stages: build the jar with a JDK, run it on a JRE. The runtime image
# carries no compiler, no Maven, no source and no ~/.m2 — about a quarter of
# the size, and a smaller thing to keep patched.

# ---------------------------------------------------------------------------
# 1 — build
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /build

# Dependencies first, in their own layer. They change when pom.xml changes;
# source changes several times an hour. Copying the pom alone means a normal
# code edit reuses the downloaded dependencies instead of fetching them again.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B -ntp dependency:go-offline

COPY src/ src/
# Tests are skipped here on purpose: they start a Postgres container through
# Testcontainers, and a build running inside Docker has no daemon to start it
# with. `./mvnw verify` on a machine or on CI is where they run — this image is
# built from code that already passed there.
RUN ./mvnw -B -ntp clean package -DskipTests

# Split the jar into layers by how often they change: dependencies almost
# never, application classes every build. A redeploy then ships the last layer
# instead of the whole 60MB jar.
RUN java -Djarmode=layertools -jar target/*.jar extract --destination extracted

# ---------------------------------------------------------------------------
# 2 — run
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

# Not root. A container process that is compromised should not also own the
# filesystem it is standing on.
RUN addgroup -S app && adduser -S app -G app
USER app

COPY --from=build --chown=app:app /build/extracted/dependencies/ ./
COPY --from=build --chown=app:app /build/extracted/spring-boot-loader/ ./
COPY --from=build --chown=app:app /build/extracted/snapshot-dependencies/ ./
COPY --from=build --chown=app:app /build/extracted/application/ ./

EXPOSE 8080

# No `local` profile here. The container reads DB_URL, JWT_SECRET and the rest
# from the environment, exactly as a deployed environment will — so running it
# this way exercises the real configuration path, not the developer shortcut.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "org.springframework.boot.loader.launch.JarLauncher"]
