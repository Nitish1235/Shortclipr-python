BEGIN;

CREATE TABLE IF NOT EXISTS worker_region_state (
    job_class text NOT NULL CHECK (job_class IN ('api','render')),
    region text NOT NULL,
    capacity integer NOT NULL CHECK (capacity > 0),
    blocked_until timestamptz,
    last_error text,
    last_rejection_at timestamptz,
    last_success_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(job_class, region)
);

CREATE INDEX IF NOT EXISTS worker_region_state_blocked_idx
    ON worker_region_state(job_class, blocked_until);

COMMIT;
