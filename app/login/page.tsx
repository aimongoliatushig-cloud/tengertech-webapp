import Image from "next/image";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

import { LoginForm } from "./login-form";
import styles from "./page.module.css";

const TRANSPORT_INSPECTOR_HOME =
  "/projects?department=%D0%90%D0%B2%D1%82%D0%BE%20%D0%B1%D0%B0%D0%B0%D0%B7%2C%20%D1%85%D0%BE%D0%B3%20%D1%82%D1%8D%D1%8D%D0%B2%D1%8D%D1%80%D0%BB%D1%8D%D0%BB%D1%82%D0%B8%D0%B9%D0%BD%20%D1%85%D1%8D%D0%BB%D1%82%D1%8D%D1%81";

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
    case "rate-limit":
      return "Олон удаа буруу оролдлого хийлээ. Түр хүлээгээд дахин оролдоно уу.";
    default:
      return "";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  if (session) {
    const flags = session.groupFlags;
    if (
      session.role === "transport_inspector" ||
      (flags?.mfoInspector && !flags.mfoManager && !flags.mfoDispatcher)
    ) {
      redirect(TRANSPORT_INSPECTOR_HOME);
    }

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
            style={{ width: "184px", height: "auto" }}
            priority
            unoptimized
          />
        </div>

        <div className={styles.heroCard}>
          <h1>Хот тохижилтын удирдлагын төв</h1>
          <p>Өдрийн ажил, хэлтсийн урсгал, тайлан болон хяналтаа нэг дороос удирдана.</p>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formWrap}>
          <div className={styles.formHeader}>
            <h2>Нэвтрэх</h2>
          </div>

          <LoginForm
            className={styles.form}
            fieldClassName={styles.field}
            submitButtonClassName={styles.submitButton}
            errorMessage={errorMessage}
            errorClassName={styles.errorBox}
          />
        </div>
      </section>
    </main>
  );
}
