package com.evrental.vehicle;

import java.util.List;

public record FilterOptionsResponse(List<String> makes, List<String> batteryTypes) {
}
