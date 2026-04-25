import type { CSSProperties } from "react";

import Image from "next/image";
import Link from "next/link";

import { AppMenu } from "@/app/_components/app-menu";
import { getRoleLabel, hasCapability, isMasterRole, isWorkerOnly, type AppSession } from "@/lib/auth";
import {
  buildDashboardModel,
  type DashboardActionRow,
  type DashboardComparisonCard,
  type DashboardItem,
  type DashboardLinkChip,
  type DashboardSummaryCard,
  type DashboardTrendPoint,
  type StatusTone,
} from "@/lib/dashboard-model";
import { type FieldAssignment } from "@/lib/field-ops";
import { type DashboardSnapshot } from "@/lib/odoo";

import styles from "./page.module.css";

type DashboardViewProps = {
  session: AppSession;
  snapshot: DashboardSnapshot;
  todayAssignments: FieldAssignment[];
};

type CriticalCardId = "overdue" | "risk" | "review" | "today";

type CriticalCardMeta = {
  label: string;
  foot: string;
  icon: string;
};

const CRITICAL_CARD_META: Record<CriticalCardId, CriticalCardMeta> = {
  overdue: {
    label: "Хоцорсон",
    foot: "ажил",
    icon: "⛔",
  },
  risk: {
    label: "Яаралтай",
    foot: "анхаарах",
    icon: "⚠",
  },
  review: {
    label: "Шалгах",
    foot: "зүйл",
    icon: "◔",
  },
  today: {
    label: "Өнөөдөр",
    foot: "ажил",
    icon: "●",
  },
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function toneClass(tone: StatusTone) {
  switch (tone) {
    case "good":
      return styles.toneGood;
    case "attention":
      return styles.toneAttention;
    case "urgent":
      return styles.toneUrgent;
    case "muted":
      return styles.toneMuted;
    default:
      return styles.toneMuted;
  }
}

function toneLabel(tone: StatusTone) {
  switch (tone) {
    case "good":
      return "Хэвийн";
    case "attention":
      return "Шалгах";
    case "urgent":
      return "Яаралтай";
    case "muted":
      return "Хүлээгдэж буй";
    default:
      return "Төлөв";
  }
}

function parsePercent(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

function findSummaryCard(
  cards: DashboardSummaryCard[],
  id: DashboardSummaryCard["id"],
) {
  return cards.find((card) => card.id === id) ?? null;
}

function chartPolyline(
  points: DashboardTrendPoint[],
  accessor: (point: DashboardTrendPoint) => number,
  width: number,
  height: number,
  padding: number,
) {
  if (!points.length) {
    return "";
  }

  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const step = points.length > 1 ? usableWidth / (points.length - 1) : 0;

  return points
    .map((point, index) => {
      const x = padding + step * index;
      const y = height - padding - (usableHeight * accessor(point)) / 100;
      return `${x},${y}`;
    })
    .join(" ");
}

function heatStyle(row: DashboardActionRow): CSSProperties {
  return {
    "--heat-width": `${row.heat}%`,
  } as CSSProperties;
}

function ringStyle(value: number): CSSProperties {
  return {
    background: `conic-gradient(var(--ring-color) ${value}%, rgba(205, 219, 207, 0.38) ${value}% 100%)`,
  };
}

function StatusChip({ tone, label }: { tone: StatusTone; label?: string }) {
  return (
    <span className={cx(styles.statusChip, toneClass(tone))}>
      {label ?? toneLabel(tone)}
    </span>
  );
}

function CriticalStatCard({
  card,
  cardId,
}: {
  card: DashboardSummaryCard;
  cardId: CriticalCardId;
}) {
  const meta = CRITICAL_CARD_META[cardId];

  return (
    <Link
      href={card.href}
      className={cx(styles.criticalCard, styles[`critical${cardId[0].toUpperCase()}${cardId.slice(1)}`], toneClass(card.tone))}
    >
      <div className={styles.criticalTop}>
        <span className={styles.criticalIcon} aria-hidden>
          {meta.icon}
        </span>
        <StatusChip tone={card.tone} />
      </div>
      <div className={styles.criticalBody}>
        <span className={styles.criticalLabel}>{meta.label}</span>
        <strong className={styles.criticalValue}>{card.value}</strong>
      </div>
      <span className={styles.criticalFoot}>{meta.foot}</span>
    </Link>
  );
}

function CompletionRingCard({ card }: { card: DashboardSummaryCard }) {
  const completion = parsePercent(card.value);

  return (
    <Link
      href={card.href}
      className={cx(styles.ringCard, toneClass(card.tone))}
      style={ringStyle(completion)}
    >
      <div className={styles.ringInner}>
        <span className={styles.sectionEyebrow}>Гүйцэтгэл</span>
        <strong>{card.value}</strong>
        <span className={styles.ringSubtext}>{toneLabel(card.tone)}</span>
      </div>
    </Link>
  );
}

function OverviewBars({
  cards,
  title,
}: {
  cards: DashboardComparisonCard[];
  title: string;
}) {
  const visibleCards = [...cards]
    .sort((left, right) => parsePercent(left.metric) - parsePercent(right.metric))
    .slice(0, 5);

  return (
    <section className={styles.barsPanel}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Нийт байдал</span>
          <h2>{title}</h2>
        </div>
      </div>

      {visibleCards.length ? (
        <div className={styles.barList}>
          {visibleCards.map((card) => {
            const value = parsePercent(card.metric);

            return (
              <Link
                key={card.id}
                href={card.href}
                className={cx(styles.barRow, toneClass(card.tone))}
              >
                <div className={styles.barRowHeader}>
                  <strong>{card.title}</strong>
                  <span>{card.metric}</span>
                </div>
                <div className={styles.barTrack}>
                  <span
                    className={cx(styles.barFill, toneClass(card.tone))}
                    style={{ width: `${value}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <strong>Одоогоор өгөгдөл алга</strong>
          <span>Нэгжийн явц харагдахгүй байна</span>
        </div>
      )}
    </section>
  );
}

function ActionRow({ row }: { row: DashboardActionRow }) {
  return (
    <article
      className={cx(styles.actionRow, toneClass(row.tone))}
      style={heatStyle(row)}
    >
      <div className={styles.actionHeat} aria-hidden>
        <span />
      </div>
      <div className={styles.actionCopy}>
        <strong>{row.title}</strong>
        <span>{row.timeLabel}</span>
      </div>
      <div className={styles.actionMeta}>
        <StatusChip tone={row.tone} label={row.statusLabel} />
        <Link href={row.href} className={styles.rowButton}>
          {row.buttonLabel}
        </Link>
      </div>
    </article>
  );
}

function ActionList({
  title,
  tone,
  rows,
  emptyLabel,
}: {
  title: string;
  tone: StatusTone;
  rows: DashboardActionRow[];
  emptyLabel: string;
}) {
  return (
    <section className={cx(styles.actionList, toneClass(tone))}>
      <div className={styles.actionListHeader}>
        <div>
          <span className={styles.sectionEyebrow}>{title}</span>
          <h2>{rows.length ? `Топ ${rows.length}` : "Одоогоор алга"}</h2>
        </div>
        <span className={styles.listCount}>{rows.length}</span>
      </div>

      {rows.length ? (
        <div className={styles.actionRows}>
          {rows.map((row) => (
            <ActionRow key={row.id} row={row} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <strong>{emptyLabel}</strong>
          <span>Шуурхай дараалал үүсээгүй</span>
        </div>
      )}
    </section>
  );
}

function QuickFilterRail({ filters }: { filters: DashboardLinkChip[] }) {
  return (
    <div className={styles.quickFilterRail}>
      {filters.map((filter) => (
        <Link
          key={filter.id}
          href={filter.href}
          className={cx(styles.quickFilterChip, toneClass(filter.tone))}
        >
          <span className={styles.quickFilterLabel}>{filter.label}</span>
          <strong className={styles.quickFilterValue}>{filter.value}</strong>
        </Link>
      ))}
    </div>
  );
}

function FocusPanel({
  title,
  description,
  primaryItem,
  secondaryItems,
}: {
  title: string;
  description: string;
  primaryItem: DashboardItem | null;
  secondaryItems: DashboardItem[];
}) {
  return (
    <section className={styles.focusPanel}>
      <div className={styles.focusHeader}>
        <div>
          <span className={styles.sectionEyebrow}>{title}</span>
          <h2>{primaryItem ? primaryItem.title : "Одоогоор сааталгүй"}</h2>
          <p className={styles.focusDescription}>{description}</p>
        </div>
        {primaryItem ? <StatusChip tone={primaryItem.tone} label={primaryItem.statusLabel} /> : null}
      </div>

      {primaryItem ? (
        <Link href={primaryItem.href} className={styles.focusPrimary}>
          <div className={styles.focusPrimaryTop}>
            <strong>{primaryItem.title}</strong>
            {primaryItem.value ? <span>{primaryItem.value}</span> : null}
          </div>
          <p>{primaryItem.subtitle}</p>
          <div className={styles.focusPrimaryMeta}>
            {primaryItem.meta.slice(0, 3).map((meta) => (
              <span key={meta}>{meta}</span>
            ))}
          </div>
          <span className={styles.focusPrimaryAction}>{primaryItem.actionLabel}</span>
        </Link>
      ) : (
        <div className={styles.emptyState}>
          <strong>Шуурхай дараалалгүй байна</strong>
          <span>Одоогоор эхэнд нь гаргах шаардлагатай ажил алга.</span>
        </div>
      )}

      {secondaryItems.length ? (
        <div className={styles.focusSecondaryList}>
          {secondaryItems.slice(0, 3).map((item) => (
            <Link key={item.id} href={item.href} className={styles.focusSecondaryLink}>
              <div>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </div>
              <StatusChip tone={item.tone} label={item.statusLabel} />
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TrendChart({ points }: { points: DashboardTrendPoint[] }) {
  const width = 720;
  const height = 230;
  const padding = 24;
  const completionLine = chartPolyline(points, (point) => point.completion, width, height, padding);
  const overdueLine = chartPolyline(points, (point) => point.overdue, width, height, padding);
  const latestPoint = points[points.length - 1] ?? {
    completion: 0,
    overdue: 0,
  };

  return (
    <section className={styles.trendPanel}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Хяналт / Тренд</span>
          <h2>Сүүлийн 7 өдөр</h2>
        </div>
        <div className={styles.trendLegend}>
          <span className={styles.legendItem}>
            <span className={cx(styles.legendSwatch, styles.legendCompletion)} />
            Гүйцэтгэл
          </span>
          <span className={styles.legendItem}>
            <span className={cx(styles.legendSwatch, styles.legendOverdue)} />
            Хоцролт
          </span>
        </div>
      </div>

      <div className={styles.trendCanvas}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={styles.trendSvg}
          role="img"
          aria-label="Сүүлийн 7 өдрийн гүйцэтгэл болон хоцролтын график"
        >
          {[20, 40, 60, 80].map((offset) => {
            const y = height - padding - ((height - padding * 2) * offset) / 100;

            return (
              <line
                key={offset}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                className={styles.trendGridLine}
              />
            );
          })}

          <polyline
            points={completionLine}
            className={styles.trendLineCompletion}
            fill="none"
          />
          <polyline
            points={overdueLine}
            className={styles.trendLineOverdue}
            fill="none"
          />

          {points.map((point, index) => {
            const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
            const x = padding + step * index;
            const completionY = height - padding - ((height - padding * 2) * point.completion) / 100;
            const overdueY = height - padding - ((height - padding * 2) * point.overdue) / 100;

            return (
              <g key={point.id}>
                <circle cx={x} cy={completionY} r="4.5" className={styles.dotCompletion} />
                <circle cx={x} cy={overdueY} r="4.5" className={styles.dotOverdue} />
              </g>
            );
          })}
        </svg>

        <div className={styles.trendAxis}>
          {points.map((point) => (
            <span key={point.id}>{point.label}</span>
          ))}
        </div>
      </div>

      <div className={styles.trendStats}>
        <article className={styles.trendStatCard}>
          <span>Өнөөдрийн гүйцэтгэл</span>
          <strong>{latestPoint.completion}%</strong>
        </article>
        <article className={styles.trendStatCard}>
          <span>Өнөөдрийн хоцролт</span>
          <strong>{latestPoint.overdue}%</strong>
        </article>
      </div>
    </section>
  );
}

export function DashboardView({ session, snapshot, todayAssignments }: DashboardViewProps) {
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const roleLabel = getRoleLabel(session.role);
  const model = buildDashboardModel({
    session,
    snapshot,
    todayAssignments,
  });

  const overdueCard = findSummaryCard(model.summaryCards, "overdue");
  const riskCard = findSummaryCard(model.summaryCards, "risk");
  const reviewCard = findSummaryCard(model.summaryCards, "review");
  const todayCard = findSummaryCard(model.summaryCards, "today");
  const completionCard = findSummaryCard(model.summaryCards, "completion");

  return (
    <main className={styles.shell}>
      <div className={styles.layoutGrid}>
        <aside className={styles.sideRail}>
          <AppMenu
            active="dashboard"
            canCreateProject={canCreateProject}
            canCreateTasks={canCreateTasks}
            canWriteReports={canWriteReports}
            canViewQualityCenter={canViewQualityCenter}
            canUseFieldConsole={canUseFieldConsole}
            userName={session.name}
            roleLabel={roleLabel}
            masterMode={masterMode}
            workerMode={workerMode}
            variant={model.variant === "executive" ? "executive" : "default"}
          />
        </aside>

        <div className={styles.mainColumn}>
          <header className={styles.topbar}>
            <div className={styles.heroStack}>
              <div className={styles.brandBlock}>
                <div className={styles.brandMark}>
                  <Image
                    src="/logo.png"
                    alt="Хот тохижилтын удирдлагын төв"
                    width={172}
                    height={54}
                    className={styles.brandLogo}
                    priority
                    unoptimized
                  />
                </div>

                <div className={styles.heroCopy}>
                  <span className={styles.contextTag}>{model.eyebrow}</span>
                  <h1>{model.title}</h1>
                  <p className={styles.heroDescription}>{model.description}</p>
                </div>
              </div>

              <div className={styles.heroMeta}>
                <span>{roleLabel}</span>
                <span>{model.scopeLabel}</span>
                <span>{model.updatedAt}</span>
                {model.emphasis ? <span className={styles.heroAccent}>{model.emphasis}</span> : null}
              </div>

              <QuickFilterRail filters={model.quickFilters} />
            </div>

            <div className={styles.heroAside}>
              <div className={styles.userCard}>
                <div className={styles.userCardTop}>
                  <div>
                    <span>{roleLabel}</span>
                    <strong>{session.name}</strong>
                  </div>

                  <div className={styles.userAlert}>
                    <small>Анхаарах</small>
                    <strong>{model.alertCount}</strong>
                  </div>
                </div>

                <small>
                  {workerMode
                    ? "Өөрт оноогдсон ажил, тайлан, маршрутаа эхний дэлгэцээс удирдана."
                    : "Шийдвэр шаардах урсгалыг эхний дэлгэцээс унших биш шууд хөдөлгөхөөр байрлууллаа."}
                </small>

                <form action="/auth/logout" method="post">
                  <button type="submit" className={styles.logoutButton}>
                    Гарах
                  </button>
                </form>
              </div>

              <FocusPanel
                title={model.focusSection.title}
                description={model.focusSection.description}
                primaryItem={model.focusSection.primaryItem}
                secondaryItems={model.focusSection.secondaryItems}
              />
            </div>
          </header>

          {model.sourceNotice ? (
            <section className={styles.sourceNotice}>
              <div className={styles.sourceCopy}>
                <strong>{model.sourceNotice.title}</strong>
                <p className={styles.sourceNoticeBody}>{model.sourceNotice.body}</p>
              </div>
              <Link href={model.sourceNotice.href} className={styles.noticeLink}>
                {model.sourceNotice.actionLabel}
              </Link>
            </section>
          ) : null}

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Нэг хараад ойлгох</span>
                <h2>Шуурхай байдал</h2>
              </div>
            </div>

            <div className={styles.overviewBoard}>
              {overdueCard ? <CriticalStatCard card={overdueCard} cardId="overdue" /> : null}
              {riskCard ? <CriticalStatCard card={riskCard} cardId="risk" /> : null}
              {reviewCard ? <CriticalStatCard card={reviewCard} cardId="review" /> : null}
              {todayCard ? <CriticalStatCard card={todayCard} cardId="today" /> : null}
              {completionCard ? <CompletionRingCard card={completionCard} /> : null}
              <OverviewBars
                cards={model.comparisonCards}
                title={model.variant === "worker" ? "Надад холбогдох явц" : "Нэгжийн гүйцэтгэл"}
              />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Яг одоо хийх</span>
                <h2>Шийдвэр ба шалгалт</h2>
              </div>
            </div>

            <div className={styles.actionZone}>
              <ActionList
                title="Хоцорсон ажлууд"
                tone="urgent"
                rows={model.overdueRows}
                emptyLabel="Хоцорсон ажил алга"
              />
              <ActionList
                title="Шалгах тайлангууд"
                tone="attention"
                rows={model.reviewRows}
                emptyLabel="Шалгах тайлан алга"
              />
            </div>
          </section>

          <section className={styles.section}>
            <TrendChart points={model.trendPoints} />
          </section>
        </div>
      </div>
    </main>
  );
}
