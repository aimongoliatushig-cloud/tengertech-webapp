import styles from "./report-image-select.module.css";

type ImageItem = { id: number; url: string; name: string };

// Тайлангийн зургийн харах сүлжээ (дарвал томоор шинэ цонхонд нээгдэнэ).
// Экспортод оруулах зургийн сонголтыг "Тайлан татах" modal дотор хийнэ.
export function SelectableReportImageGrid({
  images,
  gridClassName,
}: {
  images: ImageItem[];
  gridClassName?: string;
}) {
  return (
    <div className={gridClassName}>
      {images.map((image) => (
        <a
          key={image.id}
          className={styles.tile}
          href={image.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Томоор харах"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.name} />
        </a>
      ))}
    </div>
  );
}
