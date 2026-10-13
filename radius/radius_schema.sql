-- FreeRADIUS PostgreSQL Schema
-- This file is managed by the MikroTik Config Builder

-- NAS (Network Access Server) table - MikroTik routers
CREATE TABLE IF NOT EXISTS nas (
    id SERIAL PRIMARY KEY,
    nasname VARCHAR(128) NOT NULL,
    shortname VARCHAR(32),
    type VARCHAR(30) DEFAULT 'other',
    ports INTEGER,
    secret VARCHAR(60) NOT NULL,
    server VARCHAR(64),
    community VARCHAR(50),
    description VARCHAR(200) DEFAULT 'RADIUS Client',
    connection_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Radcheck - User authentication rules
CREATE TABLE IF NOT EXISTS radcheck (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op CHAR(2) NOT NULL DEFAULT '==',
    value VARCHAR(253) NOT NULL,
    customer_id UUID,
    subscription_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Radreply - User reply attributes
CREATE TABLE IF NOT EXISTS radreply (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op CHAR(2) NOT NULL DEFAULT '=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Radgroupcheck - Group check rules
CREATE TABLE IF NOT EXISTS radgroupcheck (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op CHAR(2) NOT NULL DEFAULT '==',
    value VARCHAR(253) NOT NULL
);

-- Radgroupreply - Group reply attributes
CREATE TABLE IF NOT EXISTS radgroupreply (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op CHAR(2) NOT NULL DEFAULT '=',
    value VARCHAR(253) NOT NULL
);

-- Radusergroup - User to group mapping
CREATE TABLE IF NOT EXISTS radusergroup (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    groupname VARCHAR(64) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Radacct - Accounting data (session tracking)
CREATE TABLE IF NOT EXISTS radacct (
    radacctid BIGSERIAL PRIMARY KEY,
    acctsessionid VARCHAR(64) NOT NULL,
    acctuniqueid VARCHAR(32) UNIQUE,
    username VARCHAR(64) NOT NULL,
    realm VARCHAR(64),
    nasipaddress INET NOT NULL,
    nasportid VARCHAR(15),
    nasporttype VARCHAR(32),
    acctstarttime TIMESTAMP,
    acctupdatetime TIMESTAMP,
    acctstoptime TIMESTAMP,
    acctinterval INTEGER,
    acctsessiontime INTEGER,
    acctauthentic VARCHAR(32),
    connectinfo_start VARCHAR(50),
    connectinfo_stop VARCHAR(50),
    acctinputoctets BIGINT,
    acctoutputoctets BIGINT,
    calledstationid VARCHAR(50),
    callingstationid VARCHAR(50),
    acctterminatecause VARCHAR(32),
    servicetype VARCHAR(32),
    framedprotocol VARCHAR(32),
    framedipaddress INET,
    customer_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Radpostauth - Authentication log
CREATE TABLE IF NOT EXISTS radpostauth (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    pass VARCHAR(64),
    reply VARCHAR(32) NOT NULL,
    authdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    nasipaddress INET,
    calledstationid VARCHAR(50),
    callingstationid VARCHAR(50)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username);
CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username);
CREATE INDEX IF NOT EXISTS idx_radusergroup_username ON radusergroup(username);
CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_sessionid ON radacct(acctsessionid);
CREATE INDEX IF NOT EXISTS idx_radacct_nasip ON radacct(nasipaddress);
CREATE INDEX IF NOT EXISTS idx_radacct_starttime ON radacct(acctstarttime);
CREATE INDEX IF NOT EXISTS idx_radacct_stoptime ON radacct(acctstoptime);
CREATE INDEX IF NOT EXISTS idx_radacct_customer ON radacct(customer_id);
CREATE INDEX IF NOT EXISTS idx_nas_nasname ON nas(nasname);
CREATE INDEX IF NOT EXISTS idx_radpostauth_username ON radpostauth(username);
CREATE INDEX IF NOT EXISTS idx_radpostauth_date ON radpostauth(authdate);

-- Views for billing integration
CREATE OR REPLACE VIEW v_customer_sessions AS
SELECT
    c.id AS customer_id,
    c.name AS customer_name,
    c.email AS customer_email,
    r.username,
    r.acctsessionid,
    r.nasipaddress,
    r.acctstarttime,
    r.acctstoptime,
    r.acctsessiontime,
    r.acctinputoctets,
    r.acctoutputoctets,
    r.framedipaddress,
    r.calledstationid,
    r.callingstationid,
    CASE WHEN r.acctstoptime IS NULL THEN true ELSE false END AS is_online
FROM customers c
LEFT JOIN radcheck rc ON rc.customer_id = c.id
LEFT JOIN radacct r ON r.username = rc.username
WHERE r.acctstarttime IS NOT NULL;

CREATE OR REPLACE VIEW v_customer_usage AS
SELECT
    c.id AS customer_id,
    c.name AS customer_name,
    rc.username,
    COALESCE(SUM(r.acctsessiontime), 0) AS total_session_time,
    COALESCE(SUM(r.acctinputoctets), 0) AS total_upload,
    COALESCE(SUM(r.acctoutputoctets), 0) AS total_download,
    COALESCE(SUM(r.acctinputoctets + r.acctoutputoctets), 0) AS total_bytes,
    COUNT(DISTINCT r.acctsessionid) AS session_count,
    MAX(r.acctstarttime) AS last_session
FROM customers c
LEFT JOIN radcheck rc ON rc.customer_id = c.id
LEFT JOIN radacct r ON r.username = rc.username
GROUP BY c.id, c.name, rc.username;
