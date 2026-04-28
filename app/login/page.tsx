import Image from "next/image";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

import styles from "./page.module.css";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
};

function getErrorMessage(code?: string) {
  switch (code) {
    case "missing":
      return "Нэвтрэх нэр болон нууц үгээ бөглөнө үү.";
    case "invalid":
      return "Нэвтрэх нэр эсвэл нууц үг буруу байна.";
    case "connection":
      return "Сервертэй холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.";
    default:
      return "";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  const params = (await searchParams) ?? {};
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = getErrorMessage(errorCode);

  return (
    <main className={styles.shell}>
      <section className={styles.brandPanel} aria-label="Хот тохижилтын нэвтрэх хэсэг">
        <div className={styles.brandTop}>
          <Image
            src="/logo.png"
            alt="Хот тохижилт үйлчилгээний төв"
            width={184}
            height={64}
            className={styles.logo}
            priority
            unoptimized
          />
          <span className={styles.badge}>Дотоод систем</span>
        </div>

        <div className={styles.heroCard}>
          <span className={styles.kicker}>Дотоод нэгж</span>
          <h1>Хот тохижилтын удирдлагын төв</h1>
          <p>Өдрийн ажил, хэлтсийн урсгал, тайлан болон хяналтаа нэг дороос удирдана.</p>
          <div className={styles.heroChips} aria-hidden>
            <span>Ажил</span>
            <span>Тайлан</span>
            <span>Хяналт</span>
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formWrap}>
          <div className={styles.formHeader}>
            <span className={styles.formBadge}>Нэвтрэх хэсэг</span>
            <h2>Нэвтрэх</h2>
          </div>

          <form action="/auth/login" method="post" className={styles.form}>
            <label className={styles.field} htmlFor="login-name">
              <span>Нэвтрэх нэр</span>
              <input
                id="login-name"
                name="login"
                type="text"
                placeholder="Нэвтрэх нэрээ оруулна уу"
                autoComplete="username"
                enterKeyHint="next"
                required
              />
            </label>

            <label className={styles.field} htmlFor="login-password">
              <span>Нууц үг</span>
              <input
                id="login-password"
                name="password"
                type="password"
                placeholder="Нууц үгээ оруулна уу"
                autoComplete="current-password"
                enterKeyHint="go"
                required
              />
            </label>

            {errorMessage ? <p className={styles.errorBox}>{errorMessage}</p> : null}

            <button type="submit" className={styles.submitButton}>
              Нэвтрэх
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
