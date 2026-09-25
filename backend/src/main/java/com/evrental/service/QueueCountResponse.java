package com.evrental.service;

/** One row of the dashboard's queue strip: a queue, its label, and how many bikes sit in it. */
public record QueueCountResponse(ServiceQueue queue, String label, long openJobs) {
}
