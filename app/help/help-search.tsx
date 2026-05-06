"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import { Search } from "lucide-react";

import type { HelpTopic } from "@/lib/help-content";

import styles from "./help.module.css";

type HelpSearchProps = {
  topics: HelpTopic[];
};

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("mn-MN").trim();
}

function topicSearchText(topic: HelpTopic) {
  return [
    topic.title,
    topic.summary,
    topic.route,
    topic.audience,
    ...topic.tags,
    ...topic.steps.flatMap((step) => [step.title, step.body]),
  ]
    .join(" ")
    .toLocaleLowerCase("mn-MN");
}

export function HelpSearch({ topics }: HelpSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearch(query);
  const searchableTopics = useMemo(
    () =>
      topics.map((topic) => ({
        topic,
        searchText: topicSearchText(topic),
      })),
    [topics],
  );
  const results = normalizedQuery
    ? searchableTopics
        .filter(({ searchText }) => searchText.includes(normalizedQuery))
        .map(({ topic }) => topic)
    : [];

  return (
    <section className={styles.searchPanel} aria-label="Тусламж хайх">
      <div className={styles.searchBox}>
        <Search aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Жишээ: тайлан, зураг, батлах, машин, HR"
          aria-label="Тусламжийн сэдэв хайх"
        />
      </div>

      {normalizedQuery ? (
        <div className={styles.searchResults}>
          <div className={styles.searchResultsHeader}>
            <strong>Хайлтын үр дүн</strong>
            <span>{results.length} сэдэв</span>
          </div>
          {results.length ? (
            <div className={styles.resultGrid}>
              {results.map((topic) => (
                <Link key={topic.id} href={`#${topic.id}`} className={styles.resultCard}>
                  <span>{topic.route}</span>
                  <strong>{topic.title}</strong>
                  <small>{topic.summary}</small>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.emptySearch}>
              Энэ үгээр таны эрхийн хүрээнд харагдах тусламж олдсонгүй.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
