SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('pipeline-watchdog', 'archive-old-pipeline-events-weekly');
