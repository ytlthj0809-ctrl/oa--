export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS v2_admin_account (
    account_id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_admin_session (
    token_hash CHAR(64) PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    idle_expires_at DATETIME(3) NOT NULL,
    last_seen_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_v2_admin_session_account (account_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_eligibility (
    bixin_user_id VARCHAR(20) PRIMARY KEY,
    nickname VARCHAR(128) NOT NULL DEFAULT '',
    first_seen_date DATE NOT NULL,
    first_import_id VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_anchor (
    anchor_id VARCHAR(64) PRIMARY KEY,
    bixin_user_id VARCHAR(20) NULL UNIQUE,
    legacy_login_account VARCHAR(255) NULL,
    display_name VARCHAR(128) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    password_hash VARCHAR(255) NULL,
    wechat_openid VARCHAR(128) NULL UNIQUE,
    status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_v2_anchor_legacy_login (legacy_login_account)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_anchor_bixin_alias (
    bixin_user_id VARCHAR(20) PRIMARY KEY,
    anchor_id VARCHAR(64) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_v2_anchor_bixin_alias_anchor (anchor_id, is_primary)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_miniapp_session (
    token_hash CHAR(64) PRIMARY KEY,
    anchor_id VARCHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_v2_miniapp_session_anchor (anchor_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_wechat_bind_token (
    token_hash CHAR(64) PRIMARY KEY,
    openid VARCHAR(128) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_registration_request (
    registration_id VARCHAR(64) PRIMARY KEY,
    bixin_user_id VARCHAR(20) NOT NULL,
    anchor_id VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    review_status ENUM('APPROVED','REJECTED') NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_v2_registration_bixin (bixin_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_payment_request (
    request_id VARCHAR(64) PRIMARY KEY,
    anchor_id VARCHAR(64) NOT NULL,
    real_name VARCHAR(128) NOT NULL,
    id_card_no VARCHAR(64) NOT NULL,
    payment_mobile VARCHAR(32) NOT NULL,
    bank_card_no VARCHAR(64) NOT NULL,
    review_status ENUM('PENDING_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    review_reason VARCHAR(500) NOT NULL DEFAULT '',
    reviewed_at DATETIME(3) NULL,
    reviewed_by VARCHAR(64) NULL,
    client_request_id VARCHAR(128) NULL UNIQUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_v2_payment_request_anchor (anchor_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_yzh_contract (
    anchor_id VARCHAR(64) PRIMARY KEY,
    sign_status VARCHAR(32) NOT NULL DEFAULT 'UNSIGNED',
    presign_url TEXT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_yzh_callback (
    callback_key CHAR(64) PRIMARY KEY,
    anchor_id VARCHAR(64) NULL,
    request_id VARCHAR(128) NOT NULL DEFAULT '',
    event_type VARCHAR(64) NOT NULL DEFAULT '',
    sign_status VARCHAR(32) NOT NULL,
    masked_detail_json JSON NOT NULL,
    received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_v2_yzh_callback_anchor (anchor_id, received_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_import_batch (
    import_id VARCHAR(64) PRIMARY KEY,
    business_date DATE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash CHAR(64) NOT NULL,
    object_key VARCHAR(500) NOT NULL DEFAULT '',
    row_count INT NOT NULL,
    positive_count INT NOT NULL,
    zero_count INT NOT NULL,
    total_star BIGINT NOT NULL,
    total_amount_cents BIGINT NOT NULL,
    status ENUM('ACTIVE','DELETED') NOT NULL DEFAULT 'ACTIVE',
    created_by VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    deleted_by VARCHAR(64) NULL,
    deleted_at DATETIME(3) NULL,
    INDEX idx_v2_import_date_status (business_date, status),
    INDEX idx_v2_import_file_hash (file_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_import_row (
    import_id VARCHAR(64) NOT NULL,
    bixin_user_id VARCHAR(20) NOT NULL,
    nickname VARCHAR(128) NOT NULL DEFAULT '',
    star_value BIGINT NOT NULL,
    amount_cents BIGINT NOT NULL,
    anchor_id VARCHAR(64) NULL,
    posted_at DATETIME(3) NULL,
    PRIMARY KEY (import_id, bixin_user_id),
    INDEX idx_v2_import_row_bixin (bixin_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_balance_account (
    anchor_id VARCHAR(64) PRIMARY KEY,
    balance_cents BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_balance_flow (
    flow_id VARCHAR(64) PRIMARY KEY,
    anchor_id VARCHAR(64) NOT NULL,
    direction ENUM('IN','OUT') NOT NULL,
    amount_cents BIGINT NOT NULL,
    balance_after_cents BIGINT NOT NULL,
    flow_type VARCHAR(32) NOT NULL,
    reference_id VARCHAR(64) NOT NULL,
    reason VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_v2_balance_reference (flow_type, reference_id, anchor_id),
    INDEX idx_v2_balance_anchor_time (anchor_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_withdraw_weekday (
    weekday TINYINT PRIMARY KEY,
    is_open BOOLEAN NOT NULL DEFAULT TRUE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_withdraw_date_override (
    business_date DATE PRIMARY KEY,
    is_open BOOLEAN NOT NULL,
    updated_by VARCHAR(64) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_withdraw_apply (
    apply_id VARCHAR(64) PRIMARY KEY,
    anchor_id VARCHAR(64) NOT NULL,
    business_date DATE NOT NULL,
    amount_cents BIGINT NOT NULL,
    status ENUM('PENDING_PAYOUT','SUCCESS','REJECTED') NOT NULL DEFAULT 'PENDING_PAYOUT',
    client_request_id VARCHAR(128) NOT NULL UNIQUE,
    export_id VARCHAR(64) NULL,
    reject_reason VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    resolved_at DATETIME(3) NULL,
    resolved_by VARCHAR(64) NULL,
    INDEX idx_v2_withdraw_date_status (business_date, status),
    INDEX idx_v2_withdraw_anchor_date (anchor_id, business_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_payout_export (
    export_id VARCHAR(64) PRIMARY KEY,
    business_date DATE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash CHAR(64) NOT NULL,
    row_count INT NOT NULL,
    total_amount_cents BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    download_count INT NOT NULL DEFAULT 1,
    last_downloaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_v2_payout_date (business_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_payout_export_file (
    export_id VARCHAR(64) NOT NULL,
    part_no INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash CHAR(64) NOT NULL,
    object_key VARCHAR(500) NOT NULL,
    PRIMARY KEY (export_id, part_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_protocol_agreement (
    anchor_id VARCHAR(64) NOT NULL,
    protocol_type VARCHAR(64) NOT NULL,
    version_no VARCHAR(32) NOT NULL,
    agreed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (anchor_id, protocol_type, version_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS v2_audit_log (
    audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    actor_type ENUM('ADMIN','ANCHOR','SYSTEM') NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id VARCHAR(128) NOT NULL,
    detail_json JSON NOT NULL,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_v2_audit_time (created_at),
    INDEX idx_v2_audit_actor (actor_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];
