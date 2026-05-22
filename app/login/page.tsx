import Image from "next/image";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

import { LoginForm } from "./login-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const WORK_DASHBOARD_HOME = "/";

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
      redirect(WORK_DASHBOARD_HOME);
    }

    redirect(WORK_DASHBOARD_HOME);
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
          <h1>Тохижилт үйлчилгээний төвийн ERP систем</h1>
          <p>Хянах самбар, ажил төлөвлөлт, гүйцэтгэл, хүний нөөц, техникийн хуваарилалт зэргийг нэг дороос удирдана.</p>
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
