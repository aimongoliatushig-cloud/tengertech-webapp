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
      return "Нэвтрэх мэдээлэл буруу байна. Odoo дээрх хэрэглэгчийн нэр, нууц үгээ шалгана уу.";
    case "connection":
      return "Odoo сервертэй холбогдож чадсангүй. Odoo ажиллаж байгаа эсэхийг шалгана уу.";
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
      <section className={styles.infoPanel}>
        <div className={styles.infoIntro}>
          <span className={styles.eyebrow}>Хотын ажиллагааны нэгдсэн платформ</span>
          <h1>Хотын ажиллагааг нэг дороос удирдана</h1>
          <p>
            Odoo систем дэх ажил, талбарын тайлан, хяналтын мөр, багийн урсгалыг
            гар утас болон компьютер дээр ижил ойлгомжтойгоор ашиглах орчин.
          </p>
        </div>

        <div className={styles.signalGrid}>
          <article className={styles.signalCard}>
            <span>Шийдвэр</span>
            <strong>1 самбар</strong>
            <small>Менежерт яг одоо анхаарах зүйлс эхэндээ харагдана</small>
          </article>
          <article className={styles.signalCard}>
            <span>Талбай</span>
            <strong>Гар утсанд төвлөрсөн</strong>
            <small>Маршрут, ажилбар, тайлангийн урсгал гар утсанд төвлөрсөн</small>
          </article>
          <article className={styles.signalCard}>
            <span>Тайлан</span>
            <strong>Нэг урсгал</strong>
            <small>Ноорог, илгээсэн, баталсан төлөв нэг логикоор явна</small>
          </article>
        </div>

        <div className={styles.featureList}>
          <article className={styles.featureCard}>
            <strong>Үйл ажиллагаа хариуцсан менежер</strong>
            <span>Шийдвэр шаардах эрсдэл, KPI, баталгаажуулалтыг эхний дэлгэц дээр харна</span>
          </article>
          <article className={styles.featureCard}>
            <strong>Багийн ахлагч</strong>
            <span>Өнөөдрийн ажил, тайлан, хоцролт гурвыг богино урсгалаар удирдана</span>
          </article>
          <article className={styles.featureCard}>
            <strong>Ажилтан</strong>
            <span>Зөвхөн надад оноогдсон ажил, тайлан, маршрутаа уншиж ажиллана</span>
          </article>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formWrap}>
          <div className={styles.formHeader}>
            <span className={styles.formBadge}>Odoo нэвтрэлт</span>
            <h2>Нэвтрэх</h2>
            <p>
              Odoo дээрх одоогийн хэрэглэгчийн нэр, нууц үгээрээ шууд орно.
              Тусдаа системийн эрх үүсгэх шаардлагагүй.
            </p>
          </div>

          <div className={styles.formSteps}>
            <span>1. Odoo эрхээр орно</span>
            <span>2. Самбар автоматаар нээгдэнэ</span>
            <span>3. Өөрийн үүрэгт тохирсон цэс гарна</span>
          </div>

          <form action="/auth/login" method="post" className={styles.form}>
            <label className={styles.field} htmlFor="login-name">
              <span>Нэвтрэх нэр</span>
              <small>Odoo хэрэглэгчийн нэр эсвэл и-мэйл</small>
              <input
                id="login-name"
                name="login"
                type="text"
                placeholder="Жишээ нь: admin эсвэл suldee@gmail.com"
                autoComplete="username"
                enterKeyHint="next"
                required
              />
            </label>

            <label className={styles.field} htmlFor="login-password">
              <span>Нууц үг</span>
              <small>Odoo дээр ашигладаг нууц үг</small>
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
              Дашбоард руу нэвтрэх
            </button>
          </form>

          <div className={styles.footerHint}>
            <div>
              <span>Туршилтын эрх</span>
              <small>Туршилтын эсвэл локал орчинд ашиглана</small>
            </div>
            <strong className={styles.footerCode}>admin / admin</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
