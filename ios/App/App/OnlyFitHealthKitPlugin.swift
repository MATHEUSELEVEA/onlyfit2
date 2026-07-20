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
        CAPPluginMethod(name: "startBackgroundDelivery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private let isoFormatter = ISO8601DateFormatter()
    private let calendar = Calendar(identifier: .gregorian)
    private var observerQueries: [String: HKObserverQuery] = [:]

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
        call.resolve([
            "available": true,
            "status": "available",
            "read_authorization_inspectable": false,
            "data_types": readTypePairs().map { $0.key }
        ])
    }

    @objc public func syncInitial(_ call: CAPPluginCall) {
        let days = max(1, min(call.getInt("days") ?? 90, 365))
        let endDate = Date()
        let startDate = calendar.date(byAdding: .day, value: -days, to: endDate) ?? endDate
        syncRange(startDate: startDate, endDate: endDate, call: call, mode: "initial", anchors: [:])
    }

    @objc public func syncDelta(_ call: CAPPluginCall) {
        let endDate = Date()
        let startDate = calendar.date(byAdding: .day, value: -14, to: endDate) ?? endDate
        syncRange(startDate: startDate, endDate: endDate, call: call, mode: "delta", anchors: anchors(from: call))
    }

    @objc public func startBackgroundDelivery(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["enabled": false, "reason": "Apple Health indisponível neste dispositivo."])
            return
        }

        registerObserverQueries()

        let group = DispatchGroup()
        let failedTypesLock = DispatchQueue(label: "app.onlyfit.healthkit.backgroundDelivery")
        var failedTypes: [String] = []
        for pair in readTypePairs() {
            group.enter()
            healthStore.enableBackgroundDelivery(for: pair.type, frequency: .immediate) { success, _ in
                if !success { failedTypesLock.sync { failedTypes.append(pair.key) } }
                group.leave()
            }
        }

        group.notify(queue: .main) {
            call.resolve([
                "enabled": failedTypes.isEmpty,
                "failed_types": failedTypes
            ])
        }
    }

    @objc public func openSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.resolve(["opened": false])
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url) { opened in
                call.resolve(["opened": opened])
            }
        }
    }

    @objc public func disconnect(_ call: CAPPluginCall) {
        healthStore.disableAllBackgroundDelivery { _, _ in
            self.observerQueries.values.forEach { self.healthStore.stop($0) }
            self.observerQueries.removeAll()
            call.resolve(["disconnected": true])
        }
    }

    private func readTypes() -> Set<HKObjectType> {
        Set(readTypePairs().map { $0.type })
    }

    private func readTypePairs() -> [(key: String, type: HKSampleType)] {
        var types: [(key: String, type: HKSampleType)] = [("workouts", HKObjectType.workoutType())]

        [
            ("active_energy", HKQuantityTypeIdentifier.activeEnergyBurned),
            ("distance_walking_running", HKQuantityTypeIdentifier.distanceWalkingRunning),
            ("distance_cycling", HKQuantityTypeIdentifier.distanceCycling),
            ("heart_rate", HKQuantityTypeIdentifier.heartRate),
            ("resting_heart_rate", HKQuantityTypeIdentifier.restingHeartRate),
            ("hrv", HKQuantityTypeIdentifier.heartRateVariabilitySDNN),
            ("steps", HKQuantityTypeIdentifier.stepCount)
        ].compactMap { pair -> (key: String, type: HKSampleType)? in
            guard let type = HKObjectType.quantityType(forIdentifier: pair.1) else { return nil }
            return (pair.0, type)
        }.forEach { types.append($0) }

        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.append(("sleep", sleep))
        }

        return types
    }

    private func syncRange(startDate: Date, endDate: Date, call: CAPPluginCall, mode: String, anchors: [String: String]) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health indisponível neste dispositivo.")
            return
        }

        let group = DispatchGroup()
        let syncLock = DispatchQueue(label: "app.onlyfit.healthkit.syncRange")
        var activities: [[String: Any]] = []
        var dailySummaries: [[String: Any]] = []
        var deletedProviderActivityIds: [String] = []
        var nextAnchors: [String: String] = [:]
        var syncError: Error?

        group.enter()
        fetchWorkoutsAnchored(startDate: startDate, endDate: endDate, mode: mode, anchor: anchors["workouts"]) { result in
            switch result {
            case .success(let payload):
                syncLock.sync {
                    activities = payload.rows
                    deletedProviderActivityIds = payload.deletedIds
                    if let anchor = payload.anchor { nextAnchors["workouts"] = anchor }
                }
            case .failure(let error):
                syncLock.sync { syncError = error }
            }
            group.leave()
        }

        group.enter()
        fetchDailySummaries(startDate: startDate, endDate: endDate) { result in
            switch result {
            case .success(let rows):
                syncLock.sync { dailySummaries = rows }
            case .failure(let error):
                syncLock.sync { syncError = error }
            }
            group.leave()
        }

        group.enter()
        fetchChangedAnchors(startDate: startDate, endDate: endDate, mode: mode, anchors: anchors) { anchors in
            syncLock.sync {
                anchors.forEach { nextAnchors[$0.key] = $0.value }
            }
            group.leave()
        }

        group.notify(queue: .main) {
            if let syncError = syncError {
                call.reject(syncError.localizedDescription)
                return
            }

            let receivedDataTypes = self.receivedDataTypes(activities: activities, dailySummaries: dailySummaries)
            let expectedDataTypes = self.readTypePairs().map { $0.key }
            let emptyTypes = expectedDataTypes.filter { !receivedDataTypes.contains($0) }

            call.resolve([
                "activities": activities,
                "daily_summaries": dailySummaries,
                "deleted_provider_activity_ids": deletedProviderActivityIds,
                "anchors": nextAnchors,
                "permission_status": [
                    "status": emptyTypes.count == expectedDataTypes.count ? "unknown" : (emptyTypes.isEmpty ? "granted" : "partial"),
                    "empty_data_types": emptyTypes,
                    "read_authorization_inspectable": false
                ],
                "sync_metadata": [
                    "mode": mode,
                    "synced_at": self.isoFormatter.string(from: Date()),
                    "from": self.isoFormatter.string(from: startDate),
                    "to": self.isoFormatter.string(from: endDate)
                ]
            ])
        }
    }

    private func anchors(from call: CAPPluginCall) -> [String: String] {
        let raw = call.getObject("anchors") ?? [:]
        var anchors: [String: String] = [:]
        raw.forEach { key, value in
            if let stringValue = value as? String { anchors[key] = stringValue }
        }
        return anchors
    }

    private func encodeAnchor(_ anchor: HKQueryAnchor?) -> String? {
        guard let anchor = anchor else { return nil }
        guard let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) else {
            return nil
        }
        return data.base64EncodedString()
    }

    private func decodeAnchor(_ value: String?) -> HKQueryAnchor? {
        guard let value = value, let data = Data(base64Encoded: value) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private func registerObserverQueries() {
        for pair in readTypePairs() where observerQueries[pair.key] == nil {
            let query = HKObserverQuery(sampleType: pair.type, predicate: nil) { [weak self] _, completionHandler, error in
                var payload: [String: Any] = [
                    "data_type": pair.key,
                    "observed_at": self?.isoFormatter.string(from: Date()) ?? ISO8601DateFormatter().string(from: Date())
                ]
                if let error = error { payload["error"] = error.localizedDescription }
                self?.notifyListeners("healthKitChanged", data: payload)
                completionHandler()
            }
            observerQueries[pair.key] = query
            healthStore.execute(query)
        }
    }

    private func fetchWorkoutsAnchored(
        startDate: Date,
        endDate: Date,
        mode: String,
        anchor: String?,
        completion: @escaping (Result<(rows: [[String: Any]], deletedIds: [String], anchor: String?), Error>) -> Void
    ) {
        let predicate: NSPredicate?
        if mode == "initial" {
            predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [.strictStartDate])
        } else {
            predicate = nil
        }
        let query = HKAnchoredObjectQuery(
            type: HKObjectType.workoutType(),
            predicate: predicate,
            anchor: mode == "initial" ? nil : decodeAnchor(anchor),
            limit: HKObjectQueryNoLimit
        ) { _, samples, deletedObjects, newAnchor, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            let workouts = (samples as? [HKWorkout]) ?? []
            if workouts.isEmpty {
                completion(.success(([], (deletedObjects ?? []).map { $0.uuid.uuidString }, self.encodeAnchor(newAnchor))))
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
                completion(.success((
                    rows.filter { !$0.isEmpty }.sorted {
                        (($0["started_at"] as? String) ?? "") > (($1["started_at"] as? String) ?? "")
                    },
                    (deletedObjects ?? []).map { $0.uuid.uuidString },
                    self.encodeAnchor(newAnchor)
                )))
            }
        }
        healthStore.execute(query)
    }

    private func fetchChangedAnchors(
        startDate: Date,
        endDate: Date,
        mode: String,
        anchors: [String: String],
        completion: @escaping ([String: String]) -> Void
    ) {
        let group = DispatchGroup()
        let lock = DispatchQueue(label: "app.onlyfit.healthkit.anchors")
        var nextAnchors: [String: String] = [:]

        for pair in readTypePairs() where pair.key != "workouts" {
            group.enter()
            let predicate: NSPredicate?
            if mode == "initial" {
                predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [.strictStartDate])
            } else {
                predicate = nil
            }
            let query = HKAnchoredObjectQuery(
                type: pair.type,
                predicate: predicate,
                anchor: mode == "initial" ? nil : decodeAnchor(anchors[pair.key]),
                limit: HKObjectQueryNoLimit
            ) { _, _, _, newAnchor, _ in
                if let encoded = self.encodeAnchor(newAnchor) {
                    lock.sync { nextAnchors[pair.key] = encoded }
                }
                group.leave()
            }
            healthStore.execute(query)
        }

        group.notify(queue: .global(qos: .userInitiated)) {
            completion(nextAnchors)
        }
    }

    private func receivedDataTypes(activities: [[String: Any]], dailySummaries: [[String: Any]]) -> Set<String> {
        var received = Set<String>()
        if !activities.isEmpty { received.insert("workouts") }
        for summary in dailySummaries {
            if summary["steps"] != nil { received.insert("steps") }
            if summary["active_kcal"] != nil { received.insert("active_energy") }
            if summary["avg_hr"] != nil || summary["max_hr"] != nil { received.insert("heart_rate") }
            if summary["resting_hr"] != nil { received.insert("resting_heart_rate") }
            if summary["hrv_rmssd"] != nil { received.insert("hrv") }
            if summary["sleep_minutes"] != nil { received.insert("sleep") }
        }
        return received
    }

    private func mapWorkout(_ workout: HKWorkout, heartRate: (avg: Double?, max: Double?)) -> [String: Any] {
        let mapped = mapActivityType(workout.workoutActivityType)
        let deviceName = workout.device?.name ?? ""
        let deviceModel = workout.device?.model ?? ""
        let deviceManufacturer = workout.device?.manufacturer ?? ""
        let sourceName = workout.sourceRevision.source.name
        let bundleIdentifier = workout.sourceRevision.source.bundleIdentifier
        let watchMarkers = [
            deviceName,
            deviceModel,
            deviceManufacturer,
            sourceName,
            bundleIdentifier
        ].joined(separator: " ").lowercased()
        let isAppleWatch = watchMarkers.contains("apple watch") || watchMarkers.contains("watch")
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
                "source_name": sourceName,
                "bundle_identifier": bundleIdentifier,
                "activity_type_raw": workout.workoutActivityType.rawValue,
                "device_name": deviceName,
                "device_model": deviceModel,
                "device_manufacturer": deviceManufacturer,
                "device_type": isAppleWatch ? "apple_watch" : "ios",
                "is_apple_watch": isAppleWatch
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
