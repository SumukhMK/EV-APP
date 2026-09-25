package com.evrental;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point.
 *
 * Async is on because the two cross-module contracts that cross a thread
 * boundary — the service-job-closed charge and the SMS dispatch — are declared
 * in docs/architecture/ARCHITECTURE.md as {@code @Async}, not as a queue.
 * Scheduling is on for the Monday SMS reminder and the weekly billing run.
 */
@SpringBootApplication
@EnableAsync
@EnableScheduling
public class EvRentalApplication {

    public static void main(String[] args) {
        SpringApplication.run(EvRentalApplication.class, args);
    }
}
