export interface PredefinedQuery {
  id: string;
  label: string;
  icon: string;
  /** Matched case-insensitively against DatabaseInfo.filename */
  filePattern: string;
  sql: string;
  description: string;
}

export interface QueryGroup {
  id: string;
  label: string;
  icon: string;
  queries: PredefinedQuery[];
}

export const QUERY_GROUPS: QueryGroup[] = [
  {
    id: 'messages',
    label: 'Messages',
    icon: '💬',
    queries: [
      {
        id: 'messages-recent',
        label: 'Recent Messages',
        icon: '💬',
        filePattern: 'sms.db',
        description: 'All iMessages and SMS, newest first',
        sql: `SELECT
  m.rowid AS id,
  datetime(m.date / 1000000000 + 978307200, 'unixepoch', 'localtime') AS sent_at,
  CASE WHEN m.is_from_me = 1 THEN 'Me'
       ELSE COALESCE(h.id, 'Unknown') END AS from_contact,
  CASE WHEN m.is_from_me = 1 THEN COALESCE(h.id, 'Unknown')
       ELSE 'Me' END AS to_contact,
  m.text,
  m.is_from_me,
  m.is_read,
  m.service
FROM message m
LEFT JOIN handle h ON m.handle_id = h.rowid
ORDER BY m.date DESC
LIMIT 500`,
      },
      {
        id: 'messages-chats',
        label: 'Conversations',
        icon: '📋',
        filePattern: 'sms.db',
        description: 'Chat threads with message counts',
        sql: `SELECT
  c.rowid AS chat_id,
  c.chat_identifier,
  c.display_name,
  c.service_name,
  COUNT(cmj.message_id) AS message_count,
  datetime(MAX(m.date) / 1000000000 + 978307200, 'unixepoch', 'localtime') AS last_message_at
FROM chat c
LEFT JOIN chat_message_join cmj ON c.rowid = cmj.chat_id
LEFT JOIN message m ON cmj.message_id = m.rowid
GROUP BY c.rowid
ORDER BY MAX(m.date) DESC`,
      },
    ],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: '👤',
    queries: [
      {
        id: 'contacts-all',
        label: 'All Contacts',
        icon: '👤',
        filePattern: 'addressbook.sqlitedb',
        description: 'All contacts with phone numbers',
        sql: `SELECT
  p.ROWID AS id,
  p.First, p.Last, p.Organization,
  mv.value AS phone,
  datetime(p.CreationDate + 978307200, 'unixepoch', 'localtime') AS created_at,
  datetime(p.ModificationDate + 978307200, 'unixepoch', 'localtime') AS modified_at
FROM ABPerson p
LEFT JOIN ABMultiValue mv ON mv.record_id = p.ROWID AND mv.property = 3
ORDER BY p.Last, p.First`,
      },
    ],
  },
  {
    id: 'calls',
    label: 'Call Logs',
    icon: '📞',
    queries: [
      {
        id: 'calls-recent',
        label: 'Recent Calls',
        icon: '📞',
        filePattern: 'callhistory.storedata',
        description: 'All calls, newest first',
        sql: `SELECT
  ROWID AS id,
  datetime(ZDATE + 978307200, 'unixepoch', 'localtime') AS call_time,
  ZADDRESS AS number,
  ROUND(ZDURATION, 0) AS duration_sec,
  CASE ZANSWERED WHEN 1 THEN 'Answered' ELSE 'Missed' END AS answered,
  CASE ZORIGINATED WHEN 1 THEN 'Outgoing' ELSE 'Incoming' END AS direction,
  ZNAME AS contact_name,
  ZSERVICE_PROVIDER AS service
FROM ZCALLRECORD
ORDER BY ZDATE DESC
LIMIT 500`,
      },
      {
        id: 'calls-missed',
        label: 'Missed Calls',
        icon: '📵',
        filePattern: 'callhistory.storedata',
        description: 'Unanswered incoming calls',
        sql: `SELECT
  ROWID AS id,
  datetime(ZDATE + 978307200, 'unixepoch', 'localtime') AS call_time,
  ZADDRESS AS number, ZNAME AS contact_name
FROM ZCALLRECORD
WHERE ZANSWERED = 0 AND ZORIGINATED = 0
ORDER BY ZDATE DESC LIMIT 200`,
      },
    ],
  },
  {
    id: 'notes',
    label: 'Notes',
    icon: '📝',
    queries: [
      {
        id: 'notes-all',
        label: 'All Notes',
        icon: '📝',
        filePattern: 'notestore.sqlite',
        description: 'Notes with titles and modification dates',
        sql: `SELECT
  n.Z_PK AS id,
  n.ZTITLE AS title,
  datetime(n.ZCREATIONDATE + 978307200, 'unixepoch', 'localtime') AS created_at,
  datetime(n.ZMODIFICATIONDATE + 978307200, 'unixepoch', 'localtime') AS modified_at,
  n.ZACCOUNT AS account
FROM ZICCLOUDSYNCINGOBJECT n
WHERE n.ZTITLE IS NOT NULL
ORDER BY n.ZMODIFICATIONDATE DESC`,
      },
    ],
  },
  {
    id: 'safari',
    label: 'Safari',
    icon: '🌐',
    queries: [
      {
        id: 'safari-history',
        label: 'Browsing History',
        icon: '🌐',
        filePattern: 'history.db',
        description: 'Safari browsing history',
        sql: `SELECT
  datetime(hv.visit_time + 978307200, 'unixepoch', 'localtime') AS visited_at,
  hi.url, hi.title, hi.visit_count
FROM history_visits hv
JOIN history_items hi ON hv.history_item = hi.id
ORDER BY hv.visit_time DESC LIMIT 1000`,
      },
    ],
  },
];

export const ALL_QUERIES: PredefinedQuery[] = QUERY_GROUPS.flatMap((g) => g.queries);
