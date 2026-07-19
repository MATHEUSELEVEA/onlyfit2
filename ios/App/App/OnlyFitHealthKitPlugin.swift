import Capacitor
import Foundation
import HealthKit
import UIKit

@objc(OnlyFitHealthKitPlugin)
public class OnlyFitHealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OnlyFitHealthKitPlugin"
    public let jsName = "OnlyFitHealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncInitial", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncDelta", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private let isoFormatter = ISO8601DateFormatter()
    private let calendar = Calendar(identifier: .gregorian)

    @objc public func isAvailable(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["available": false, "reason": "Apple Health indisponível neste dispositivo."])
            return
        }
        call.resolve(["available": true])
    }

    @objc public func requestPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false, "denied": ["unavailable"]])
            return
        }

        healthStore.requestAuthorization(toShare: [], read: readTypes()) { success, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": success])
        }
    }

    @objc public func getAuthorizationStatus(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["available": false, "status": "unavailable"])
            return
        }
        call.resolve(["available": true, "status": "available"])
    }

    @objc public func syncInitial(_ call: CAPPluginCall) {
        let days = max(1, min(call.getInt("days") ?? 90, 365))
        let endDate = Date()
        let startDate = calendar.date(byAdding: .day, value: -days, to: endDate) ?? endDate
        syncRange(startDate: startDate, endDate: endDate, call: call, mode: "initial")
    }

    @objc public func syncDelta(_ call: CAPPluginCall) {
        let endDate = Date()
        let startDate = calendar.date(byAdding: .day, value: -14, to: endDate) ?? endDate
        syncRange(startDate: startDate, endDate: endDate, call: call, mode: "delta")
    }

    @objc public func disconnect(_ call: CAPPluginCall) {
        call.resolve(["disconnected": true])
    }

    private func readTypes() -> Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]

        [
            HKQuantityTypeIdentifier.activeEnergyBurned,
            HKQuantityTypeIdentifier.distanceWalkingRunning,
            HKQuantityTypeIdentifier.distanceCycling,
            HKQuantityTypeIdentifier.heartRate,
            HKQuantityTypeIdentifier.restingHeartRate,
            HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
            HKQuantityTypeIdentifier.stepCount
        ].compactMap { HKObjectType.quantityType(forIdentifier: $0) }.forEach { types.insert($0) }

        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }

        return types
    }

    private func syncRange(startDate: Date, endDate: Date, call: CAPPluginCall, mode: String) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health indisponível neste dispositivo.")
            return
        }

        let group = DispatchGroup()
        var activities: [[String: Any]] = []
        var dailySummaries: [[String: Any]] = []
        var syncError: Error?

        group.enter()
        fetchWorkouts(startDate: startDate, endDate: endDate) { result in
            switch result {
            case .success(let rows):
                activities = rows
            case .failure(let error):
                syncError = error
            }
            group.leave()
        }

        group.enter()
        fetchDailySummaries(startDate: startDate, endDate: endDate) { result in
            switch result {
            case .success(let rows):
                dailySummaries = rows
            case .failure(let error):
                syncError = error
            }
            group.leave()
        }

        group.notify(queue: .main) {
            if let syncError = syncError {
                call.reject(syncError.localizedDescription)
                return
            }

            call.resolve([
                "activities": activities,
                "daily_summaries": dailySummaries,
                "deleted_provider_activity_ids": [],
                "anchors": [
                    "mode": mode,
                    "synced_at": self.isoFormatter.string(from: Date()),
                    "from": self.isoFormatter.string(from: startDate),
                    "to": self.isoFormatter.string(from: endDate)
                ]
            ])
        }
    }

    private func fetchWorkouts(startDate: Date, endDate: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [.strictStartDate])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            let workouts = (samples as? [HKWorkout]) ?? []
            if workouts.isEmpty {
                completion(.success([]))
                return
            }

            let group = DispatchGroup()
            var rows = Array(repeating: [String: Any](), count: workouts.count)

            for (index, workout) in workouts.enumerated() {
                group.enter()
                self.fetchHeartRateStats(for: workout) { heartRate in
                    rows[index] = self.mapWorkout(workout, heartRate: heartRate)
                    group.leave()
                }
            }

            group.notify(queue: .global(qos: .userInitiated)) {
                completion(.success(rows.filter { !$0.isEmpty }))
            }
        }
        healthStore.execute(query)
    }

    private func mapWorkout(_ workout: HKWorkout, heartRate: (avg: Double?, max: Double?)) -> [String: Any] {
        let mapped = mapActivityType(workout.workoutActivityType)
        var row: [String: Any] = [
            "provider_activity_id": workout.uuid.uuidString,
            "sport": mapped.sport,
            "engine": mapped.engine,
            "activity_type": "\(workout.workoutActivityType.rawValue)",
            "title": mapped.title,
            "started_at": isoFormatter.string(from: workout.startDate),
            "ended_at": isoFormatter.string(from: workout.endDate),
            "duration_s": Int(workout.duration),
            "source_payload": [
                "source_name": workout.sourceRevision.source.name,
                "bundle_identifier": workout.sourceRevision.source.bundleIdentifier,
                "activity_type_raw": workout.workoutActivityType.rawValue
            ]
        ]

        if let energy = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) {
            row["calories"] = Int(energy.rounded())
        }
        if let distance = workout.totalDistance?.doubleValue(for: .meter()) {
            row["distance_m"] = distance
            if workout.duration > 0 {
                row["avg_speed_mps"] = distance / workout.duration
            }
        }
        if let avg = heartRate.avg {
            row["avg_hr"] = Int(avg.rounded())
        }
        if let max = heartRate.max {
            row["max_hr"] = Int(max.rounded())
        }

        return row
    }

    private func fetchHeartRateStats(for workout: HKWorkout, completion: @escaping ((avg: Double?, max: Double?)) -> Void) {
        guard let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
            completion((nil, nil))
            return
        }

        let predicate = HKQuery.predicateForObjects(from: workout)
        let options: HKStatisticsOptions = [.discreteAverage, .discreteMax]
        let query = HKStatisticsQuery(quantityType: heartRateType, quantitySamplePredicate: predicate, options: options) { _, stats, _ in
            let unit = HKUnit.count().unitDivided(by: .minute())
            completion((
                stats?.averageQuantity()?.doubleValue(for: unit),
                stats?.maximumQuantity()?.doubleValue(for: unit)
            ))
        }
        healthStore.execute(query)
    }

    private func fetchDailySummaries(startDate: Date, endDate: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        let startDay = calendar.startOfDay(for: startDate)
        let endDay = calendar.startOfDay(for: endDate)
        var dates: [Date] = []
        var cursor = startDay
        while cursor <= endDay {
            dates.append(cursor)
            cursor = calendar.date(byAdding: .day, value: 1, to: cursor) ?? endDay.addingTimeInterval(86400)
        }

        if dates.isEmpty {
            completion(.success([]))
            return
        }

        let group = DispatchGroup()
        var rows = Array(repeating: [String: Any](), count: dates.count)

        for (index, date) in dates.enumerated() {
            group.enter()
            fetchDailySummary(date: date) { row in
                rows[index] = row
                group.leave()
            }
        }

        group.notify(queue: .global(qos: .userInitiated)) {
            completion(.success(rows.filter { !$0.isEmpty }))
        }
    }

    private func fetchDailySummary(date: Date, completion: @escaping ([String: Any]) -> Void) {
        let dayStart = calendar.startOfDay(for: date)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? date.addingTimeInterval(86400)
        let group = DispatchGroup()
        var metrics: [String: Any] = [
            "date": dateString(dayStart),
            "source_payload": ["timezone": TimeZone.current.identifier]
        ]

        group.enter()
        fetchCumulative(.stepCount, unit: .count(), startDate: dayStart, endDate: dayEnd) { value in
            if let value = value { metrics["steps"] = Int(value.rounded()) }
            group.leave()
        }

        group.enter()
        fetchCumulative(.activeEnergyBurned, unit: .kilocalorie(), startDate: dayStart, endDate: dayEnd) { value in
            if let value = value { metrics["active_kcal"] = Int(value.rounded()) }
            group.leave()
        }

        group.enter()
        fetchDiscrete(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), startDate: dayStart, endDate: dayEnd, options: .discreteAverage) { avg, _ in
            if let avg = avg { metrics["resting_hr"] = Int(avg.rounded()) }
            group.leave()
        }

        group.enter()
        fetchDiscrete(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()), startDate: dayStart, endDate: dayEnd, options: [.discreteAverage, .discreteMax]) { avg, max in
            if let avg = avg { metrics["avg_hr"] = Int(avg.rounded()) }
            if let max = max { metrics["max_hr"] = Int(max.rounded()) }
            group.leave()
        }

        group.enter()
        fetchDiscrete(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), startDate: dayStart, endDate: dayEnd, options: .discreteAverage) { avg, _ in
            if let avg = avg { metrics["hrv_rmssd"] = Int(avg.rounded()) }
            group.leave()
        }

        group.enter()
        fetchSleepMinutes(startDate: dayStart, endDate: dayEnd) { minutes in
            if let minutes = minutes { metrics["sleep_minutes"] = Int(minutes.rounded()) }
            group.leave()
        }

        group.notify(queue: .global(qos: .userInitiated)) {
            completion(metrics.count > 2 ? metrics : [:])
        }
    }

    private func fetchCumulative(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, startDate: Date, endDate: Date, completion: @escaping (Double?) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            completion(nil)
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [.strictStartDate])
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
            completion(stats?.sumQuantity()?.doubleValue(for: unit))
        }
        healthStore.execute(query)
    }

    private func fetchDiscrete(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, startDate: Date, endDate: Date, options: HKStatisticsOptions, completion: @escaping (Double?, Double?) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            completion(nil, nil)
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [.strictStartDate])
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: options) { _, stats, _ in
            completion(
                stats?.averageQuantity()?.doubleValue(for: unit),
                stats?.maximumQuantity()?.doubleValue(for: unit)
            )
        }
        healthStore.execute(query)
    }

    private func fetchSleepMinutes(startDate: Date, endDate: Date, completion: @escaping (Double?) -> Void) {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion(nil)
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [.strictStartDate])
        let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            let sleepSamples = (samples as? [HKCategorySample]) ?? []
            let asleepValues: Set<Int> = [
                HKCategoryValueSleepAnalysis.asleep.rawValue,
                3, // asleepCore
                4, // asleepDeep
                5  // asleepREM
            ]
            let totalSeconds = sleepSamples
                .filter { asleepValues.contains($0.value) }
                .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
            completion(totalSeconds > 0 ? totalSeconds / 60 : nil)
        }
        healthStore.execute(query)
    }

    private func mapActivityType(_ type: HKWorkoutActivityType) -> (sport: String, engine: String, title: String) {
        switch type {
        case .running:
            return ("running", "endurance", "Corrida")
        case .cycling:
            return ("cycling", "endurance", "Bike")
        case .walking:
            return ("walking", "endurance", "Caminhada")
        case .swimming:
            return ("swimming", "endurance", "Natação")
        case .traditionalStrengthTraining:
            return ("bodybuilding", "strength", "Musculação")
        case .functionalStrengthTraining, .crossTraining, .highIntensityIntervalTraining:
            return ("hiit", "crossfit", "HIIT")
        case .yoga:
            return ("yoga", "recovery", "Yoga")
        case .pilates:
            return ("pilates", "recovery", "Pilates")
        case .boxing, .martialArts, .kickboxing:
            return ("combat", "combat", "Luta")
        default:
            return ("other", "endurance", "Atividade")
        }
    }

    private func dateString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
